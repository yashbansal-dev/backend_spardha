const mongoose = require('mongoose');
require('dotenv').config();
const { User, Purchase, TeamComposition } = require('./models/models');

async function inspectOrder(orderId) {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        await mongoose.connect(mongoUri);
        
        const p = await Purchase.findOne({ orderId });
        if (!p) {
            console.log('Order not found');
            return;
        }

        console.log('--- PURCHASE OBJECT ---');
        console.log(JSON.stringify(p, null, 2));

        if (p.userDetails?.email) {
            const user = await User.findOne({ email: p.userDetails.email });
            console.log('\n--- USER OBJECT ---');
            console.log(JSON.stringify(user, null, 2));
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

const targetOrderId = process.argv[2] || 'order_cfbb5490efd7';
inspectOrder(targetOrderId);
