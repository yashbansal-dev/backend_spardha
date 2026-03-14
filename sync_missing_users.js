require('dotenv').config();
const mongoose = require('mongoose');
const { User, Purchase, TeamComposition, Event } = require('./models/models');
const { generateUserQRCode } = require('./utils/qrCodeService');

async function syncMissingUsers() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.mongodb);
        console.log('Connected!');

        const completedPurchases = await Purchase.find({ paymentStatus: 'completed' });
        console.log(`Found ${completedPurchases.length} completed purchases.`);

        let syncedCount = 0;
        let updatedCount = 0;

        for (const p of completedPurchases) {
            const email = p.userDetails?.email;
            if (!email) {
                console.log(`⚠️ Purchase ${p.orderId} has no email. Skipping.`);
                continue;
            }

            const eventNames = p.items.map(item => item.itemName).filter(name => name && name !== 'Demo Payment');

            let user = await User.findOne({ email: email.toLowerCase().trim() });

            if (!user) {
                console.log(`👤 Creating missing user for email: ${email}`);
                user = new User({
                    name: p.userDetails.name,
                    email: email.toLowerCase().trim(),
                    contactNo: p.userDetails.contactNo || '',
                    gender: p.userDetails.gender || '',
                    age: p.userDetails.age || null,
                    universityName: p.userDetails.universityName || '',
                    address: p.userDetails.address || '',
                    universityIdCard: p.userDetails.formData?.universityIdCard || '',
                    referralCode: p.userDetails.formData?.referralCode || '',
                    events: eventNames.length > 0 ? eventNames : ['General Registration'],
                    isvalidated: true
                });
                syncedCount++;
            } else {
                // Update existing user if missing crucial info or events
                let changed = false;
                if (!user.universityIdCard && p.userDetails.formData?.universityIdCard) {
                    user.universityIdCard = p.userDetails.formData.universityIdCard;
                    changed = true;
                }
                if (!user.referralCode && p.userDetails.formData?.referralCode) {
                    user.referralCode = p.userDetails.formData.referralCode;
                    changed = true;
                }

                if (eventNames.length > 0) {
                    const currentEvents = user.events || [];
                    const newEvents = eventNames.filter(e => !currentEvents.includes(e));
                    if (newEvents.length > 0) {
                        user.events = [...currentEvents, ...newEvents];
                        changed = true;
                    }
                }

                if (changed) {
                    console.log(`🆙 Updating user: ${email}`);
                    updatedCount++;
                }
            }

            // Ensure QR code
            if (!user.qrCodeBase64) {
                try {
                    const qrCodeBase64 = await generateUserQRCode(user._id, {
                        name: user.name,
                        email: user.email,
                        events: user.events || [],
                        orderId: p.orderId
                    });
                    user.qrPath = `${user._id}`;
                    user.qrCodeBase64 = qrCodeBase64;
                } catch (err) {
                    console.error(`❌ QR generation failed for ${email}:`, err.message);
                }
            }

            await user.save();

            // Link purchase to user if not linked
            if (!p.userId || p.userId.toString() !== user._id.toString()) {
                p.userId = user._id;
                p.userRegistered = true;
                await p.save();
            }
        }

        console.log(`\n✅ Sync Complete!`);
        console.log(`🆕 New users created: ${syncedCount}`);
        console.log(`🆙 Users updated: ${updatedCount}`);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error during sync:', err);
        process.exit(1);
    }
}

syncMissingUsers();
