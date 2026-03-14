require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase } = require('./models/models');

async function test() {
    await mongoose.connect(process.env.mongodb);
    const purchases = await Purchase.find({ paymentStatus: 'failed' }).sort({createdAt: -1}).limit(5);
    for (const p of purchases) {
        console.log(`Failed Order: ${p.orderId}, Error: ${p.registrationError}`);
    }
    process.exit(0);
}
test();
