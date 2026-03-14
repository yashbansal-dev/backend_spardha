require('dotenv').config();
const { Cashfree, CFEnvironment } = require('cashfree-pg');

Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = CFEnvironment.PRODUCTION; 

// Or if sandbox
// Cashfree.XEnvironment = CFEnvironment.SANDBOX;

async function test() {
    try {
        const orderId = 'order_13c528dc980e'; // The pending one
        console.log("Fetching order payments for:", orderId);
        
        let cashfree = new Cashfree(
            CFEnvironment.PRODUCTION,
            process.env.CASHFREE_APP_ID,
            process.env.CASHFREE_SECRET_KEY
        );

        const response = await cashfree.PGOrderFetchPayments(orderId);
        console.log("Response:", JSON.stringify(response.data, null, 2));
    } catch (e) {
        console.error("Error:", e.response?.data || e.message);
    }
}
test();
