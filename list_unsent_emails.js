
require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase, User } = require('./models/models');

const listUnsentEmails = async () => {
    try {
        await mongoose.connect(process.env.mongodb);
        console.log('✅ Connected to DB');

        // 1. Find Purchases with paymentStatus: 'completed' but emailSent: false
        const unsentPurchases = await Purchase.find({
            paymentStatus: 'completed',
            emailSent: { $ne: true }
        }).sort({ purchaseDate: -1 });

        console.log(`\n--- Unsent Emails from Purchases (${unsentPurchases.length} found) ---`);
        const purchaseEmails = new Set();
        unsentPurchases.forEach(p => {
            if (p.userDetails && p.userDetails.email) {
                purchaseEmails.add(p.userDetails.email);
                console.log(`Order: ${p.orderId} | Email: ${p.userDetails.email} | Date: ${p.purchaseDate}`);
            } else {
                console.log(`Order: ${p.orderId} | Email: MISSING | Date: ${p.purchaseDate}`);
            }
        });

        // 2. Find Users with emailSent: false
        const unsentUsers = await User.find({
            emailSent: { $ne: true }
        }).sort({ createdAt: -1 });

        console.log(`\n--- Unsent Emails from Users (${unsentUsers.length} found) ---`);
        const userEmails = new Set();
        unsentUsers.forEach(u => {
            userEmails.add(u.email);
            console.log(`User: ${u.name} | Email: ${u.email} | Created: ${u.createdAt}`);
        });

        // Unique list of all emails that might be missing
        const allUnsent = new Set([...purchaseEmails, ...userEmails]);
        console.log(`\n--- Total Unique Unsent Emails: ${allUnsent.size} ---`);
        allUnsent.forEach(email => console.log(email));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

listUnsentEmails();
