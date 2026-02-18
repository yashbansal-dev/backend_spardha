const mongoose = require('mongoose');
require('dotenv').config();
const { User, Purchase, TeamComposition } = require('./models/models');

async function checkDB() {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        console.log(`🔌 Connecting to MongoDB...`);
        await mongoose.connect(mongoUri);
        console.log('✅ Connected.');

        // 1. Check Users
        const userCount = await User.countDocuments();
        console.log(`\n📊 Total Users: ${userCount}`);
        const users = await User.find().sort({ _id: -1 }).limit(5);
        users.forEach(u => {
            console.log(`\n👤 [${u._id}] ${u.name}`);
            console.log(`   📧 ${u.email}`);
            console.log(`   📱 ${u.contactNo} | 🎂 Age: ${u.age || 'N/A'} | ⚧ ${u.gender || 'N/A'}`);
            console.log(`   🏫 ${u.universityName || 'N/A'} (${u.universityIdCard || 'No ID'})`);
            console.log(`   🎟️  Events (${u.events.length}): ${u.events.join(', ')}`);
        });

        // 2. Check Purchases
        const purchaseCount = await Purchase.countDocuments();
        console.log(`\n🛒 Total Purchases: ${purchaseCount}`);
        if (purchaseCount > 0) {
            const purchases = await Purchase.find().sort({ purchaseDate: -1 }).limit(3);
            purchases.forEach((p, i) => {
                const statusIcon = p.paymentStatus === 'completed' || p.paymentStatus === 'SUCCESS' ? '✅' : '⏳';
                console.log(`\n${statusIcon} Order ${i + 1}: ${p.orderId}`);
                console.log(`   Amount: ₹${p.totalAmount}`);
                console.log(`   Status: ${p.paymentStatus}`);
                console.log(`   Items: ${p.items?.map(i => i.itemName).join(', ')}`);
            });
        }

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected.');
        // 3. Check Team Compositions
        const teamCount = await TeamComposition.countDocuments();
        console.log(`\n🏆 Total Teams: ${teamCount}`);
        const teams = await TeamComposition.find().sort({ _id: -1 }).limit(5);
        teams.forEach(t => {
            console.log(`\n🛡️  [${t._id}] ${t.teamName} (${t.eventName})`);
            console.log(`   👑 Leader: ${t.teamLeader.name} (${t.teamLeader.email})`);
            console.log(`   👥 Members (${t.teamMembers.length}): ${t.teamMembers.map(m => m.name).join(', ')}`);
        });

        console.log('\n=================================\n');
        process.exit(0);
    }
}

checkDB();
