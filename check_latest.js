const mongoose = require('mongoose');
require('dotenv').config();
const { User, Purchase, TeamComposition } = require('./models/models');

async function checkLatest() {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        await mongoose.connect(mongoUri);
        
        console.log('--- LATEST 5 PURCHASES ---');
        const purchases = await Purchase.find().sort({ _id: -1 }).limit(20);
        for(let p of purchases) {
             console.log(`Order: ${p.orderId} | Status: ${p.paymentStatus} | Email: ${p.userDetails?.email} | userRegistered: ${p.userRegistered} | Date: ${p.purchaseDate}`);
             if (p.userDetails?.email) {
                 const u = await User.findOne({email: p.userDetails.email});
                 console.log(`  -> User exists: ${!!u} | Events: ${u ? u.events.join(', ') : 'N/A'}`);
             }
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
checkLatest();
