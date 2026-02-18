const mongoose = require('mongoose');
require('dotenv').config();
const { Purchase } = require('./models/models');
// We need to mock Cashfree to test just the DB part if we don't have whitelisted IP
// But let's try to run the actual internal logic

async function testCreateOrderEndpointLogic() {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        console.log(`🔌 Connecting to MongoDB...`);
        await mongoose.connect(mongoUri);
        console.log('✅ Connected.');

        // Mock Request Body (similar to what frontend sends)
        const reqBody = {
            amount: 100,
            customerName: "Endpoint Tester",
            customerEmail: "endpoint@test.com",
            customerPhone: "9876543210",
            customerGender: "Male",
            universityName: "Test Univ",
            items: [
                { id: "evt_1", title: "Test Event via Endpoint", price: 100, quantity: 1 }
            ]
        };

        // Logic copied/adapted from cashfree_simple.js to isolate DB saving
        console.log('🔄 Simulating create-order DB logic...');

        const orderId = `order_${Date.now()}`; // Mock generation

        // Mock processed items
        const processedItems = reqBody.items.map(item => ({
            type: 'event',
            itemId: item.id,
            itemName: item.title,
            price: item.price,
            quantity: item.quantity
        }));

        const newPurchase = new Purchase({
            orderId: orderId,
            paymentSessionId: 'mock_session_id',
            userDetails: {
                name: reqBody.customerName,
                email: reqBody.customerEmail,
                contactNo: reqBody.customerPhone,
                gender: reqBody.customerGender,
                universityName: reqBody.universityName,
                formData: reqBody
            },
            items: processedItems,
            subtotal: reqBody.amount,
            totalAmount: reqBody.amount,
            currency: "INR",
            paymentStatus: 'pending',
            environment: 'test_simulation',
            metadata: {
                source: 'test_endpoint_script'
            }
        });

        const saved = await newPurchase.save();
        console.log('✅ DB Save Successful for Order:', saved.orderId);

    } catch (err) {
        console.error('❌ Validation/Save Error:', err);
        if (err.errors) {
            Object.keys(err.errors).forEach(key => {
                console.error(`   -> Field '${key}': ${err.errors[key].message}`);
            });
        }
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected.');
    }
}

testCreateOrderEndpointLogic();
