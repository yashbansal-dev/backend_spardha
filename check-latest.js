require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase, User } = require('./models/models');

const checkLatest = async () => {
    try {
        await mongoose.connect(process.env.mongodb);
        console.log('✅ Connected to DB');

        // Get 3 most recent purchases
        const purchases = await Purchase.find()
            .sort({ purchaseDate: -1 })
            .limit(3);

        console.log(`\n📋 Last ${purchases.length} purchases:\n`);
        for (const p of purchases) {
            const user = await User.findOne({ email: p.userDetails?.email });
            console.log(`Order: ${p.orderId}`);
            console.log(`  Email: ${p.userDetails?.email}`);
            console.log(`  Payment Status: ${p.paymentStatus}`);
            console.log(`  Email Sent (purchase): ${p.emailSent}`);
            console.log(`  Email Sent (user): ${user?.emailSent || 'USER NOT FOUND'}`);
            console.log(`  QR Generated: ${!!user?.qrCodeBase64}`);
            console.log(`  Date: ${p.purchaseDate}`);
            console.log('---');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

checkLatest();
