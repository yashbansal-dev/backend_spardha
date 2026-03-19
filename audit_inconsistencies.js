const mongoose = require('mongoose');
require('dotenv').config();
const { User, Purchase } = require('./models/models');

async function audit() {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        await mongoose.connect(mongoUri);
        
        console.log('--- AUDIT: Purchases without Users ---');
        
        const registeredPurchases = await Purchase.find({ userRegistered: true });
        console.log(`Checking ${registeredPurchases.length} registered purchases...`);
        
        const inconsistencies = [];
        for (const p of registeredPurchases) {
            const u = await User.findById(p.userId);
            if (!u) {
                // Try searching by email just in case
                const uByEmail = await User.findOne({ email: p.userDetails?.email });
                inconsistencies.push({
                    orderId: p.orderId,
                    email: p.userDetails?.email,
                    userIdInPurchase: p.userId,
                    foundByEmail: !!uByEmail,
                    date: p.purchaseDate
                });
            }
        }
        
        console.log(`Found ${inconsistencies.length} inconsistencies:`);
        console.table(inconsistencies);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
audit();
