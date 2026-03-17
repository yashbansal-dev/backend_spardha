const mongoose = require('mongoose');
require('dotenv').config();
const { Purchase } = require('./models/models');
const { processPaymentSuccess } = require('./routes/cashfree_simple');

async function testRace() {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        await mongoose.connect(mongoUri);
        
        // Reset order for testing
        const orderId = 'order_testracetest';
        await Purchase.deleteOne({ orderId });
        await Purchase.create({
            orderId,
            totalAmount: 100,
            subtotal: 100,
            paymentStatus: 'pending',
            items: [],
            userDetails: { email: 'race@example.com', name: 'Race Test' }
        });

        console.log('✅ Prepared mock order. Triggering concurrent processing...');

        // Trigger two simultaneous calls
        const p1 = processPaymentSuccess(orderId);
        const p2 = processPaymentSuccess(orderId);

        const [r1, r2] = await Promise.all([p1, p2]);

        console.log('\n--- RESULT 1 ---');
        console.log(r1.success, r1.alreadyProcessed);
        console.log('\n--- RESULT 2 ---');
        console.log(r2.success, r2.alreadyProcessed);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
testRace();
