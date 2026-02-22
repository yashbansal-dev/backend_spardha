const mongoose = require('mongoose');
require('dotenv').config();

// Define Event Schema (Minimal version matching backend models)
const eventSchema = new mongoose.Schema({
    name: String,
    price: Number,
    category: { type: String, default: 'Sports' }
});

const Event = mongoose.model('Event', eventSchema);

const EVENTS_DATA = [
    // Flagship Events
    { name: 'Leather Cricket (Boys)', price: 400 },
    { name: 'Leather Cricket (Girls)', price: 1 },

    { name: 'Football (7v7) (Boys)', price: 250 },
    { name: 'Football (5v5) (Girls)', price: 1 },

    // Core Sports
    { name: 'Basketball (Boys)', price: 250 },
    { name: 'Basketball (Girls)', price: 1 },

    { name: 'Volleyball (Boys)', price: 250 },
    { name: 'Volleyball (Girls)', price: 1 },

    // Racquet Sports
    { name: 'Badminton (Singles) (Boys)', price: 250 },
    { name: 'Badminton (Singles) (Girls)', price: 1 },

    { name: 'Badminton (Doubles) (Boys)', price: 500 },
    { name: 'Badminton (Doubles) (Girls)', price: 1 },

    { name: 'Badminton (Mixed) (Boys)', price: 250 },
    { name: 'Badminton (Mixed) (Girls)', price: 1 },

    // Fun Events & Others
    { name: 'Box Cricket (Boys)', price: 1100 },
    { name: 'Box Cricket (Girls)', price: 1 },

    { name: 'Kabaddi (Boys)', price: 1100 },
    { name: 'Kabaddi (Girls)', price: 1 },

    { name: 'E-Sports (Boys)', price: 500 },
    { name: 'E-Sports (Girls)', price: 1 },

    // Strategy
    { name: 'Chess (Boys)', price: 150 },
    { name: 'Chess (Girls)', price: 1 },

    // Generic/Fallback
    { name: 'General Registration', price: 100 }
];

async function seedEvents() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.mongodb);
        console.log('✅ Connected.');

        console.log('🧹 Clearing existing events...');
        await Event.deleteMany({});

        console.log('🌱 Seeding Events...');

        for (const eventData of EVENTS_DATA) {
            // Upsert: Update if exists, Insert if new
            await Event.findOneAndUpdate(
                { name: eventData.name },
                eventData,
                { upsert: true, new: true }
            );
            console.log(`   - Synced: ${eventData.name} (₹${eventData.price})`);
        }

        console.log('✨ All events seeded successfully!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

seedEvents();
