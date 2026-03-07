
require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase, User, TeamComposition } = require('./models/models');

const generateEmailReport = async () => {
    try {
        await mongoose.connect(process.env.mongodb);
        console.log('✅ Connected to DB');

        console.log('\n--- Email Delivery Report ---\n');

        const users = await User.find({}).sort({ createdAt: -1 });
        const reportData = [];

        for (const user of users) {
            // Find linked purchase
            const purchase = await Purchase.findOne({
                $or: [
                    { userId: user._id },
                    { 'userDetails.email': user.email }
                ]
            });

            // Find team context
            const team = await TeamComposition.findOne({
                $or: [
                    { 'teamLeader.userId': user._id },
                    { 'teamMembers.userId': user._id }
                ]
            });

            reportData.push({
                Name: user.name,
                Email: user.email,
                EmailSent: user.emailSent ? '✅ YES' : '❌ NO',
                SentAt: user.emailSentAt ? user.emailSentAt.toLocaleString() : 'N/A',
                Events: (user.events || []).join(', '),
                OrderId: purchase ? purchase.orderId : 'Manual/Admin',
                Payment: purchase ? purchase.paymentStatus : 'N/A',
                Role: team ? (team.teamLeader.userId.toString() === user._id.toString() ? 'Leader' : 'Member') : 'Individual',
                Team: team ? team.teamName : 'N/A'
            });
        }

        // Sort by EmailSent status (unsent first)
        reportData.sort((a, b) => (a.EmailSent === b.EmailSent) ? 0 : (a.EmailSent === '❌ NO' ? -1 : 1));

        console.table(reportData);

        const unsentCount = reportData.filter(d => d.EmailSent === '❌ NO').length;
        console.log(`\nSummary:`);
        console.log(`Total Users: ${reportData.length}`);
        console.log(`Emails Sent: ${reportData.length - unsentCount}`);
        console.log(`Emails Pending: ${unsentCount}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

generateEmailReport();
