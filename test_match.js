const mongoose = require('mongoose');
require('dotenv').config();
const { Event } = require('./models/models');

const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function testMatch() {
    try {
        await mongoose.connect(process.env.mongodb);
        console.log('✅ Connected');

        const inputs = [
            { name: 'Box Cricket', category: 'Boys' },
            { name: 'Box Cricket (Boys)', category: 'Boys' },
            { name: 'Box Cricket', category: 'Girls' }
        ];

        for (const input of inputs) {
            const eventName = input.name.trim();
            const category = input.category.trim();

            console.log(`\n🔍 Input: "${eventName}" (Cat: "${category}")`);

            let event = null;
            // 1. Exact
            event = await Event.findOne({ name: { $regex: `^${escapeRegex(eventName)}$`, $options: 'i' } });
            if (event) console.log(`✅ Method 1 (Exact) matched: "${event.name}"`);

            // 2. Variant
            if (!event && category && category !== 'Open') {
                const specificName = `${eventName} (${category})`;
                console.log(`  Trying variant: "${specificName}"`);
                event = await Event.findOne({ name: { $regex: `^${escapeRegex(specificName)}$`, $options: 'i' } });
                if (event) console.log(`  ✅ Method 2 (Variant) matched: "${event.name}"`);
            }

            // 3. Partial
            if (!event) {
                console.log(`  Trying partial match...`);
                const matches = await Event.find({ name: { $regex: `${escapeRegex(eventName)}`, $options: 'i' } });
                console.log(`  Found ${matches.length} candidates`);
                if (matches.length === 1) {
                    event = matches[0];
                    console.log(`  ✅ Method 3 (Single Partial) matched: "${event.name}"`);
                } else if (matches.length > 1) {
                    event = matches.find(m => m.name.toLowerCase().includes(category.toLowerCase()));
                    if (event) console.log(`  ✅ Method 3 (Multi-Partial + Category) matched: "${event.name}"`);
                }
            }

            if (!event) console.log(`❌ FAILED to match any event.`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

testMatch();
