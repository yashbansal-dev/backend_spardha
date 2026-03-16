require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase, User } = require('./models/models');

async function test() {
    await mongoose.connect(process.env.mongodb);
    
    // Get the most recent 10 purchases
    const purchases = await Purchase.find().sort({ createdAt: -1 }).limit(10).lean();
    
    console.log('=== Last 10 Purchases ===\n');
    for (const p of purchases) {
        const user = await User.findOne({ email: p.userDetails?.email });
        const hasUser = !!user;
        const flag = (p.paymentStatus === 'pending') ? '⏳' : (hasUser ? '✅' : '❌ MISSING USER');
        
        console.log(`${flag} Order: ${p.orderId}`);
        console.log(`   Status: ${p.paymentStatus} | Email: ${p.userDetails?.email}`);
        console.log(`   Items: ${p.items.map(i => i.itemName).join(', ')}`);
        console.log(`   Created: ${p.createdAt}`);
        if (hasUser) {
            console.log(`   User Events: ${user.events.join(', ')}`);
        }
        console.log('');
    }
    
    // Also check: are there any completed purchases WITHOUT a matching user?
    const completed = await Purchase.find({ paymentStatus: 'completed' }).lean();
    let orphaned = 0;
    for (const p of completed) {
        const user = await User.findOne({ email: p.userDetails?.email });
        if (!user) {
            orphaned++;
            console.log(`❌ ORPHANED: Order ${p.orderId} | ${p.userDetails?.email} | PAID but NO USER in DB`);
        }
    }
    console.log(`\n--- Total completed: ${completed.length} | Orphaned (no user): ${orphaned} ---`);
    
    process.exit(0);
}
test();
