require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase } = require('./models/models');

async function test() {
    await mongoose.connect(process.env.mongodb);
    
    // Search for recent failed/pending orders
    const recent = await Purchase.find({
        $or: [
            { 'userDetails.name': /chelsy/i },
            { paymentStatus: 'failed' }
        ]
    }).sort({ _id: -1 }).limit(10).lean();
    
    console.log(`Found ${recent.length} matching orders:\n`);
    recent.forEach(p => {
        console.log(`Order: ${p.orderId}`);
        console.log(`  Name: ${p.userDetails?.name}`);
        console.log(`  Email: ${p.userDetails?.email}`);
        console.log(`  Status: ${p.paymentStatus}`);
        console.log(`  Error: ${p.registrationError || 'none'}`);
        console.log(`  Items: ${p.items?.map(i => i.itemName).join(', ')}`);
        console.log(`  Environment: ${p.environment}`);
        console.log('');
    });
    
    process.exit(0);
}
test();
