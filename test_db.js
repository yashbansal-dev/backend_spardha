require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase } = require('./models/models');

async function test() {
    await mongoose.connect(process.env.mongodb);
    const recentPurchases = await Purchase.find().sort({createdAt: -1}).limit(5).lean();
    for (const p of recentPurchases) {
        console.log("Order:", p.orderId, "Status:", p.paymentStatus, "Email:", p.userDetails?.email, "userId:", p.userId);
    }
    process.exit(0);
}
test();
