require('dotenv').config();
const mongoose = require('mongoose');
const { Event } = require('./models/models');

async function test() {
    await mongoose.connect(process.env.mongodb);
    
    const events = await Event.find().lean();
    console.log(`Total events in DB: ${events.length}\n`);
    events.forEach(e => {
        console.log(`  "${e.name}" => ₹${e.price}`);
    });
    
    process.exit(0);
}
test();
