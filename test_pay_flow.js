require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase, User, Event } = require('./models/models');

async function test() {
    await mongoose.connect(process.env.mongodb);
    const purchase = await Purchase.findOne({ paymentStatus: 'pending' }).sort({createdAt: -1});
    console.log("Found pending purchase:", purchase ? purchase.orderId : "None");
    if (purchase) {
        console.log("Items:", JSON.stringify(purchase.items, null, 2));
        console.log("User details:", purchase.userDetails?.email);
    }
    process.exit(0);
}
test();
