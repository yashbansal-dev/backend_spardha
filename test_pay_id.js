require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase } = require('./models/models');
const { Cashfree, CFEnvironment } = require('cashfree-pg');

async function test() {
    await mongoose.connect(process.env.mongodb);
    const orderId = 'order_2ffc62c61662'; // From screenshot
    
    // Check DB
    const dbPurchase = await Purchase.findOne({ orderId });
    console.log("DB Purchase Status:", dbPurchase ? dbPurchase.paymentStatus : "Not Found");
    if(dbPurchase) console.log("DB Email:", dbPurchase.userDetails?.email);
    
    // Check Cashfree API directly
    try {
        let cashfree = new Cashfree(
            CFEnvironment.PRODUCTION,
            process.env.CASHFREE_APP_ID,
            process.env.CASHFREE_SECRET_KEY
        );
        const cfResponse = await cashfree.PGOrderFetchPayments(orderId);
        console.log("Cashfree Data:", JSON.stringify(cfResponse.data, null, 2));
    } catch (e) {
        console.log("Cashfree fetch failed:", e.response?.data?.message || e.message);
    }
    process.exit(0);
}
test();
