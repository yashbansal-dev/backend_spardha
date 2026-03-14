require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase, User, TeamComposition } = require('./models/models');

async function test() {
    await mongoose.connect(process.env.mongodb);
    const orderId = 'order_2ffc62c61662'; // From screenshot
    
    const dbPurchase = await Purchase.findOne({ orderId }).lean();
    console.log("Purchase events:", JSON.stringify(dbPurchase.items, null, 2));
    
    if (dbPurchase.userId) {
        const user = await User.findById(dbPurchase.userId).lean();
        console.log("User events:", user.events);
        console.log("User teamRegistrations:", user.teamRegistrations);
    } else {
        const user = await User.findOne({email: dbPurchase.userDetails?.email}).lean();
        console.log("User events:", user?.events);
    }
    
    process.exit(0);
}
test();
