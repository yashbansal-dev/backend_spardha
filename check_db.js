const mongoose = require('mongoose');
require('dotenv').config();
const { User, Purchase, BookingDraft } = require('./models/models');

async function checkCounts() {
  try {
    await mongoose.connect(process.env.mongodb);
    console.log('Connected to MongoDB');

    const userCount = await User.countDocuments();
    const purchaseCount = await Purchase.countDocuments();
    const draftCount = await BookingDraft.countDocuments();

    console.log(`Users: ${userCount}`);
    console.log(`Purchases: ${purchaseCount}`);
    console.log(`Drafts: ${draftCount}`);

    const latestUser = await User.findOne().sort({ createdAt: -1 });
    console.log('Latest User:', latestUser ? JSON.stringify({ email: latestUser.email, createdAt: latestUser.createdAt }) : 'None');

    const latestPurchase = await Purchase.findOne().sort({ purchaseDate: -1 });
    console.log('Latest Purchase:', latestPurchase ? JSON.stringify({ orderId: latestPurchase.orderId, purchaseDate: latestPurchase.purchaseDate, status: latestPurchase.paymentStatus }) : 'None');

    const latestDraft = await BookingDraft.findOne().sort({ updatedAt: -1 });
    console.log('Latest Draft:', latestDraft ? JSON.stringify({ email: latestDraft.email, updatedAt: latestDraft.updatedAt }) : 'None');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCounts();
