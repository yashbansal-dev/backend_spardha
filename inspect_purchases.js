require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase, User } = require('./models/models');

async function test() {
    await mongoose.connect(process.env.mongodb);
    const purchases = await Purchase.find().sort({ createdAt: -1 }).limit(5).lean();
    console.log('Last 5 Purchases:');
    for (const p of purchases) {
        console.log(`Order ${p.orderId} | Status: ${p.paymentStatus} | Email: ${p.userDetails?.email}`);
        console.log('  Items:', p.items.map(i => i.itemName));
        if (p.paymentStatus === 'completed') {
            const user = await User.findOne({ email: p.userDetails?.email });
            console.log(`  => User found in DB: ${!!user}`);
            if(user) console.log(`  => User events: ${user.events}`);
        }
        console.log('---');
    }
    process.exit(0);
}
test();
