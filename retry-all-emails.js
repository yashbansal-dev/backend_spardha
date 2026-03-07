require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase, User, TeamComposition } = require('./models/models');
const { sendRegistrationEmail } = require('./utils/emailService');
const { generateUserQRCode } = require('./utils/qrCodeService');

const retryAllEmails = async () => {
    try {
        await mongoose.connect(process.env.mongodb);
        console.log('✅ Connected to DB');

        // 1. Find all completed purchases
        const completedPurchases = await Purchase.find({
            paymentStatus: 'completed'
        }).sort({ purchaseDate: -1 });

        console.log(`Checking ${completedPurchases.length} completed orders for unsent emails...`);

        for (const purchase of completedPurchases) {
            const userEmailsInThisOrder = [];

            // Collect main user
            if (purchase.userId) {
                const mainUser = await User.findById(purchase.userId);
                if (mainUser) userEmailsInThisOrder.push({ user: mainUser, type: 'Main User' });
            } else if (purchase.userDetails?.email) {
                const mainUser = await User.findOne({ email: purchase.userDetails.email });
                if (mainUser) userEmailsInThisOrder.push({ user: mainUser, type: 'Main User' });
            }

            // Collect team members
            const teams = await TeamComposition.find({ purchaseId: purchase._id });
            for (const team of teams) {
                for (const memberRef of team.teamMembers) {
                    const member = await User.findById(memberRef.userId);
                    if (member) userEmailsInThisOrder.push({ user: member, type: 'Team Member', eventName: team.eventName });
                }
            }

            // Process each user individually
            for (const { user, type, eventName } of userEmailsInThisOrder) {
                if (user.emailSent) continue;

                try {
                    console.log(`\n🔄 Retrying ${type}: ${user.email} (Order: ${purchase.orderId})`);

                    // Ensure they have a QR code
                    if (!user.qrCodeBase64) {
                        console.log(`  Generating QR code for ${user.email}...`);
                        const qrCodeBase64 = await generateUserQRCode(user._id, {
                            name: user.name,
                            email: user.email,
                            events: user.events && user.events.length > 0 ? user.events : (eventName ? [eventName] : []),
                            orderId: purchase.orderId
                        });
                        user.qrCodeBase64 = qrCodeBase64;
                        await user.save();
                    }

                    const emailData = {
                        name: user.name,
                        email: user.email,
                        events: user.events && user.events.length > 0 ? user.events : (eventName ? [eventName] : []),
                        qrCodeBase64: user.qrCodeBase64,
                        orderId: purchase.orderId
                    };

                    const result = await sendRegistrationEmail(user.email, emailData);
                    if (result.success) {
                        console.log(`  ✅ Email sent to ${user.email}!`);
                        user.emailSent = true;
                        user.emailSentAt = new Date();
                        await user.save();

                        // If it's the main user, sync purchase status
                        if (type === 'Main User' && !purchase.emailSent) {
                            purchase.emailSent = true;
                            purchase.emailSentAt = new Date();
                            await purchase.save();
                        }
                    } else {
                        console.log(`  ❌ Email failed for ${user.email}: ${result.error}`);
                    }
                } catch (err) {
                    console.error(`  ❌ Error processing ${user.email}:`, err.message);
                }
            }
        }

        console.log('\n✅ Done retrying unsent emails.');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

retryAllEmails();
