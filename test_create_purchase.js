const mongoose = require('mongoose');
require('dotenv').config();
const { Purchase } = require('./models/models');

async function testCreatePurchase() {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        console.log(`🔌 Connecting to MongoDB...`);
        await mongoose.connect(mongoUri);
        console.log('✅ Connected.');

        const testOrderId = `TEST_ORDER_${Date.now()}`;

        console.log(`📝 Attempting to create dummy purchase: ${testOrderId}`);

        const newPurchase = new Purchase({
            orderId: testOrderId,
            paymentSessionId: 'session_test_123',
            userDetails: {
                name: "Test User",
                email: "test@example.com",
                contactNo: "9999999999",
                gender: "Male"
            },
            items: [{
                type: 'event',
                itemName: 'Test Event',
                price: 100,
                quantity: 1
            }],
            subtotal: 100,
            totalAmount: 100,
            currency: "INR",
            paymentStatus: 'pending',
            environment: 'test',
            metadata: {
                source: 'test_script'
            }
        });

        const savedPurchase = await newPurchase.save();
        console.log('✅ Purchase saved successfully!');
        console.log('🆔 ID:', savedPurchase._id);
        console.log('📦 Content:', savedPurchase.toJSON());

        // Verify by fetching it back
        const fetched = await Purchase.findOne({ orderId: testOrderId });
        if (fetched) {
            console.log('✅ Verification: Record found in DB.');
        } else {
            console.error('❌ Verification Failed: Record NOT found in DB after save.');
        }

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected.');
    }
}

testCreatePurchase();
