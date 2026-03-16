require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase, User } = require('./models/models');

async function test() {
    await mongoose.connect(process.env.mongodb);
    
    // Get last 5 completed purchases
    const purchases = await Purchase.find({ paymentStatus: 'completed' }).sort({ _id: -1 }).limit(5).lean();
    
    console.log('=== Last 5 COMPLETED Purchases vs User records ===\n');
    for (const p of purchases) {
        console.log('ORDER:', p.orderId);
        console.log('  Purchase.userDetails:');
        console.log('    Name:', p.userDetails?.name);
        console.log('    Email:', p.userDetails?.email);
        console.log('    Phone:', p.userDetails?.contactNo);
        console.log('    Gender:', p.userDetails?.gender);
        console.log('    University:', p.userDetails?.universityName);
        console.log('    Items:', p.items?.map(i => i.itemName).join(', '));
        
        const user = await User.findOne({ email: p.userDetails?.email }).lean();
        if (user) {
            console.log('  User document in DB:');
            console.log('    Name:', user.name);
            console.log('    Email:', user.email);
            console.log('    Phone:', user.contactNo);
            console.log('    Gender:', user.gender);
            console.log('    University:', user.universityName);
            console.log('    Events:', user.events);
            console.log('    isvalidated:', user.isvalidated);
        } else {
            console.log('  ❌ NO USER FOUND for this email!');
        }
        console.log('---');
    }
    
    // Total counts
    const totalUsers = await User.countDocuments();
    const totalCompleted = await Purchase.countDocuments({ paymentStatus: 'completed' });
    console.log('\nTotal Users in DB:', totalUsers);
    console.log('Total Completed Purchases:', totalCompleted);
    
    process.exit(0);
}
test();
