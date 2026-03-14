require('dotenv').config();
const { Cashfree, CFEnvironment } = require('cashfree-pg');

async function test() {
    try {
        const orderId = 'order_b40680149159'; // A completed one we saw earlier
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
