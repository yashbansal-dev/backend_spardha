require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase, User } = require('./models/models');
const { sendRegistrationEmail } = require('./utils/emailService');
const { generateUserQRCode } = require('./utils/qrCodeService');

const retryAllEmails = async () => {
    try {
        await mongoose.connect(process.env.mongodb);
        console.log('✅ Connected to DB');

        // Get all completed purchases with emailSent: false
        const purchases = await Purchase.find({
            paymentStatus: 'completed',
            emailSent: { $ne: true }
        }).sort({ purchaseDate: -1 }).limit(10);

        console.log(`Found ${purchases.length} orders needing email...`);

        for (const purchase of purchases) {
            try {
                console.log(`\n🔄 Processing order: ${purchase.orderId}`);
                console.log(`  Purchase email: ${purchase.userDetails?.email}`);

                // Try finding user multiple ways
                let user = null;

                // Method 1: by purchase userId
                if (purchase.userId) {
                    user = await User.findById(purchase.userId);
                    if (user) console.log(`  ✅ Found user by userId: ${user.email}`);
                }

                // Method 2: by email
                if (!user && purchase.userDetails?.email) {
                    user = await User.findOne({ email: purchase.userDetails.email });
                    if (user) console.log(`  ✅ Found user by email: ${user.email}`);
                }

                if (!user) {
                    console.log(`  ❌ User not found for order ${purchase.orderId}, skipping...`);
                    // Update purchase.userId if we can find user
                    continue;
                }

                // Generate fresh QR with orderId
                const newQrCodeBase64 = await generateUserQRCode(user._id, {
                    name: user.name,
                    email: user.email,
                    events: user.events || [],
                    orderId: purchase.orderId
                });
                user.qrCodeBase64 = newQrCodeBase64;
                await user.save();

                const emailData = {
                    name: user.name,
                    email: user.email,
                    events: user.events || [],
                    qrCodeBase64: newQrCodeBase64,
                    orderId: purchase.orderId
                };

                const result = await sendRegistrationEmail(user.email, emailData);
                if (result.success) {
                    console.log(`  ✅ Email sent to ${user.email}!`);
                    purchase.emailSent = true;
                    await purchase.save();
                } else {
                    console.log(`  ❌ Email failed: ${result.error}`);
                }
            } catch (err) {
                console.error(`  ❌ Error for order ${purchase.orderId}:`, err.message);
            }
        }

        console.log('\n✅ Done processing all orders.');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

retryAllEmails();
