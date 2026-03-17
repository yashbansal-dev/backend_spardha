const mongoose = require('mongoose');
require('dotenv').config();
const { Purchase } = require('./models/models');
const { processPaymentSuccess } = require('./routes/cashfree_simple');

async function testParse() {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        await mongoose.connect(mongoUri);
        
        const orderId = 'order_testparse';
        await Purchase.deleteOne({ orderId });
        await Purchase.create({
            orderId,
            totalAmount: 1,
            subtotal: 1,
            paymentStatus: 'pending',
            items: [],
            userDetails: { email: 'parse@example.com', name: 'Parse Test' }
        });

        console.log('✅ Prepared mock order for parse. Triggering processing...');

        const result = await processPaymentSuccess(orderId, {
            transactionId: 'test_tx_123',
            paymentMethod: { upi: { channel: 'qrcode', upi_instrument_number: ''} }
        });

        console.log('\n--- RESULT ---');
        console.log(result.success, result.alreadyProcessed);
        
        const dbRecord = await Purchase.findOne({ orderId });
        console.log('Saved paymentMethod:', dbRecord.paymentMethod);

    } catch (err) {
        console.error('CRASH:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
testParse();
