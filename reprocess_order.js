const mongoose = require('mongoose');
require('dotenv').config();
const { processPaymentSuccess } = require('./routes/cashfree_simple');

async function reprocess(orderId) {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        console.log(`\n🔄 Re-processing order: ${orderId}...`);
        const result = await processPaymentSuccess(orderId);
        
        console.log('\n--- RESULT ---');
        console.log(JSON.stringify(result, null, 2));

    } catch (err) {
        console.error('\n🔥 CRASHED during re-processing:');
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

const targetOrderId = process.argv[2] || 'order_cfbb5490efd7';
reprocess(targetOrderId);
