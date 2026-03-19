const mongoose = require('mongoose');
require('dotenv').config();
const { Purchase, User } = require('./models/models');
const { processPaymentSuccess } = require('./routes/cashfree_simple');

async function fixInconsistencies() {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Find all completed purchases that don't have a valid user linkage
        const inconsistentPurchases = await Purchase.find({
            paymentStatus: 'completed',
            $or: [
                { userRegistered: { $ne: true } },
                { userId: { $exists: false } },
                { userId: null }
            ]
        });

        console.log(`🔍 Found ${inconsistentPurchases.length} inconsistent purchases.`);

        for (const p of inconsistentPurchases) {
            console.log(`\n🔄 Healing order: ${p.orderId} (${p.userDetails?.email})...`);
            
            // Re-processing using the NEW logic we just implemented
            // This will automatically normalize emails and create the user if missing.
            try {
                const result = await processPaymentSuccess(p.orderId);
                if (result.success) {
                    console.log(`   ✅ Success! User: ${result.user?.email || 'N/A'}`);
                } else {
                    console.log(`   ❌ Failed: ${result.message}`);
                }
            } catch (err) {
                console.error(`   ❌ Error: ${err.message}`);
            }
        }

        // Additional check: Purchases that HAVE a userId but the user document is missing
        const allCompleted = await Purchase.find({ paymentStatus: 'completed', userRegistered: true });
        let idMismatchCount = 0;
        
        for (const p of allCompleted) {
            if (p.userId) {
                const userExists = await User.findById(p.userId);
                if (!userExists) {
                    console.log(`\n⚠️  UserId ${p.userId} missing for order ${p.orderId} (${p.userDetails?.email}). Healing...`);
                    try {
                        // Force heal by ensuring processPaymentSuccess runs correctly
                        const result = await processPaymentSuccess(p.orderId);
                        if (result.success) {
                            console.log(`   ✅ Success!`);
                            idMismatchCount++;
                        }
                    } catch (err) {
                        console.error(`   ❌ Error: ${err.message}`);
                    }
                }
            }
        }

        console.log(`\n--- HEALING SUMMARY ---`);
        console.log(`Inconsistent records fixed: ${inconsistentPurchases.length}`);
        console.log(`ID mismatches fixed:        ${idMismatchCount}`);

    } catch (err) {
        console.error('🔥 Fatal Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

fixInconsistencies();
