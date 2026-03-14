require('dotenv').config();
const mongoose = require('mongoose');
const { processPaymentSuccess } = require('./routes/cashfree_simple');
const { Purchase } = require('./models/models');

async function test() {
    await mongoose.connect(process.env.mongodb);
    const purchase = await Purchase.findOne().sort({createdAt: -1});
    console.log("Testing with order:", purchase.orderId);
    // Note: processPaymentSuccess is not exported directly, we might need a workaround to test it
    console.log("Can't test processPaymentSuccess directly as it's not exported.");
    process.exit(0);
}
test();
