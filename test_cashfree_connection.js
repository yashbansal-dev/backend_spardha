const { Cashfree, CFEnvironment } = require('cashfree-pg');
require('dotenv').config();

async function testCashfreeConnection() {
    console.log('🔄 Testing Cashfree Connection...');
    console.log(`🔑 App ID: ${process.env.CASHFREE_APP_ID ? process.env.CASHFREE_APP_ID.slice(0, 5) + '...' : 'MISSING'}`);
    console.log(`🔐 Secret: ${process.env.CASHFREE_SECRET_KEY ? 'SET' : 'MISSING'}`);
    console.log(`🌍 Environment: ${process.env.CASHFREE_ENV || 'PRODUCTION'}`);

    try {
        const env = process.env.CASHFREE_ENV === 'SANDBOX' ? CFEnvironment.SANDBOX : CFEnvironment.PRODUCTION;

        // Instantiate Cashfree SDK
        const cashfree = new Cashfree(
            env,
            process.env.CASHFREE_APP_ID,
            process.env.CASHFREE_SECRET_KEY
        );

        const request = {
            order_amount: 1.00,
            order_currency: "INR",
            order_id: `test_${Date.now()}`,
            customer_details: {
                customer_id: "test_user",
                customer_name: "Test User",
                customer_email: "test@example.com",
                customer_phone: "9999999999"
            },
            order_meta: {
                return_url: "https://example.com/return"
            }
        };

        console.log('📡 Attempting to create test order...');
        const response = await cashfree.PGCreateOrder("2023-08-01", request);

        console.log('✅ Connection Successful!');
        console.log('✅ Order Created:', response.data.order_id);
        console.log('✅ Payment Session ID:', response.data.payment_session_id);

    } catch (error) {
        console.log('❌ Request Failed');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Message:', error.response.data.message);

            if (error.response.status === 401 || error.response.status === 403) {
                console.error('⛔ AUTHENTICATION FAILED: Check your App ID and Secret Key.');
            } else {
                console.log('✅ Authentication likely passed (we got a logic/validation error instead of Auth error).');
            }
        } else {
            console.error('Error:', error.message);
            console.error('Stack:', error.stack);
        }
    }
}

testCashfreeConnection();
