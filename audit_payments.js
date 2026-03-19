const mongoose = require('mongoose');
require('dotenv').config();
const { User, Purchase } = require('./models/models');
const { processPaymentSuccess } = require('./routes/cashfree_simple');

async function auditPayments() {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        const completedPurchases = await Purchase.find({ paymentStatus: 'completed' });
        console.log(`📊 Total Completed Purchases: ${completedPurchases.length}`);

        let issuesFound = 0;
        let fixedCount = 0;

        for (const purchase of completedPurchases) {
            let user = null;
            if (purchase.userId) {
                user = await User.findById(purchase.userId);
            } else if (purchase.userDetails?.email) {
                user = await User.findOne({ email: purchase.userDetails.email.toLowerCase().trim() });
            }

            const expectedEvents = purchase.items.map(i => i.itemName).filter(name => name && name !== 'Demo Payment');
            
            let hasIssue = false;
            let issueDescription = '';

            if (!user) {
                hasIssue = true;
                issueDescription = 'User record NOT FOUND';
            } else if (!purchase.userId) {
                hasIssue = true;
                issueDescription = 'Purchase missing userId reference';
            } else {
                // Check if user has all events
                const missingEvents = expectedEvents.filter(e => !user.events.includes(e));
                if (missingEvents.length > 0) {
                    hasIssue = true;
                    issueDescription = `User missing events: ${missingEvents.join(', ')}`;
                }
            }

            if (hasIssue) {
                issuesFound++;
                console.log(`\n⚠️  Issue with Order ${purchase.orderId} (${purchase.userDetails?.email || 'No Email'}): ${issueDescription}`);
                
                // Fix it by re-running processPaymentSuccess (which is idempotent)
                console.log(`   🔄 Re-processing order to fix...`);
                try {
                    const result = await processPaymentSuccess(purchase.orderId);
                    if (result.success) {
                        console.log(`   ✅ Fixed!`);
                        fixedCount++;
                    } else {
                        console.error(`   ❌ Failed to fix: ${result.message}`);
                    }
                } catch (err) {
                    console.error(`   ❌ Error fixing ${purchase.orderId}:`, err.message);
                }
            }
        }

        console.log('\n--- AUDIT SUMMARY ---');
        console.log(`Total Completed Purchases: ${completedPurchases.length}`);
        console.log(`Issues Found:             ${issuesFound}`);
        console.log(`Issues Fixed:             ${fixedCount}`);

    } catch (err) {
        console.error('🔥 Fatal Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

auditPayments();
