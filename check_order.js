require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase } = require('./models/models');
const { Cashfree, CFEnvironment } = require('cashfree-pg');

async function test() {
    await mongoose.connect(process.env.mongodb);

    // Use same init pattern as the codebase
    const cf = new Cashfree(
        CFEnvironment.PRODUCTION,
        process.env.CASHFREE_APP_ID,
        process.env.CASHFREE_SECRET_KEY
    );

    const orderId = 'order_c12e424ce3fb';
    console.log('Checking order ' + orderId + ' with Cashfree...');

    try {
        const response = await cf.PGOrderFetchPayments(orderId);
        console.log('Cashfree payment data:', JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.log('Cashfree error:', err.response?.data || err.message);
    }

    process.exit(0);
}
test();
