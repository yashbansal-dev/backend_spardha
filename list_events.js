const mongoose = require('mongoose');
require('dotenv').config();
const { Event } = require('./models/models');

async function check() {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        await mongoose.connect(mongoUri);
        
        const events = await Event.find({}, 'name category');
        console.log('--- ALL EVENTS ---');
        events.forEach((e, i) => {
            console.log(`${i+1}. Name: "${e.name}" | Category: "${e.category}"`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
check();
