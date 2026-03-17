const mongoose = require('mongoose');
require('dotenv').config();
const { User, Purchase, TeamComposition } = require('./models/models');

async function diagnose() {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Find completed purchases that are NOT processed (userRegistered: false) or missing userId
        const problematicPurchases = await Purchase.find({
            paymentStatus: 'completed',
            $or: [
                { userRegistered: { $ne: true } },
                { userId: { $exists: false } },
                { userId: null }
            ]
        });

        console.log(`\n🔍 Found ${problematicPurchases.length} problematic completed purchases:\n`);

        for (const p of problematicPurchases) {
            console.log(`--------------------------------------------------`);
            console.log(`Order ID: ${p.orderId}`);
            console.log(`Email: ${p.userDetails?.email}`);
            console.log(`User Registered: ${p.userRegistered}`);
            console.log(`User ID: ${p.userId}`);
            console.log(`Items: ${p.items?.map(i => i.itemName).join(', ')}`);
            
            // Check if user exists
            if (p.userDetails?.email) {
                const user = await User.findOne({ email: p.userDetails.email });
                console.log(`User document exists: ${!!user}`);
                if (user) {
                    console.log(`User validated: ${user.isvalidated}`);
                    console.log(`User events: ${user.events.join(', ')}`);
                }
            }

            // Check for teams
            const teams = await TeamComposition.find({ purchaseId: p._id });
            console.log(`Teams created: ${teams.length}`);
            if (p.userDetails?.teamMembers) {
                 const teamData = p.userDetails.teamMembers;
                 console.log(`Team members in purchase data: ${JSON.stringify(teamData).substring(0, 100)}...`);
            }
        }

        // Also check if any users are not validated but have completed purchases
        const unvalidatedUsers = await User.find({ isvalidated: false });
        console.log(`\n🔍 Found ${unvalidatedUsers.length} unvalidated users.`);

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

diagnose();
