const mongoose = require('mongoose');
require('dotenv').config();

const eventSchema = new mongoose.Schema({
    name: String,
    price: Number,
    category: { type: String, default: 'Sports' }
});

const Event = mongoose.model('Event', eventSchema);

async function listEvents() {
    try {
        await mongoose.connect(process.env.mongodb);
        const events = await Event.find({});
        console.log(JSON.stringify(events, null, 2));
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

listEvents();
