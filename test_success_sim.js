require('dotenv').config();
const mongoose = require('mongoose');

// We have to extract processPaymentSuccess or just copy its core logic to see where it fails
const { Purchase, User, TeamComposition, Event } = require('./models/models');
const { generateUserQRCode } = require('./utils/qrCodeService');

async function test() {
    await mongoose.connect(process.env.mongodb);
    const orderId = 'order_13c528dc980e';
    console.log('Testing processPaymentSuccess logic for order:', orderId);

    const purchase = await Purchase.findOne({ orderId });
    if (!purchase) {
        console.error('Purchase not found');
        return process.exit(1);
    }
    
    console.log("Found purchase. Status:", purchase.paymentStatus);
    
    try {
        const eventNames = purchase.items.map(item => item.itemName).filter(name => name && name !== 'Demo Payment');
        console.log('📝 Extracted event names from purchase:', eventNames);

        let user = null;
        if (purchase.userId) {
            user = await User.findById(purchase.userId);
            if (user) console.log(`👤 Found user by userId: ${user.email}`);
        }
        if (!user && purchase.userDetails?.email) {
            user = await User.findOne({ email: purchase.userDetails.email });
            if (user) console.log(`👤 Found user by email: ${user.email}`);
        }

        if (!user) {
            console.log('👤 Creating new user for email:', purchase.userDetails.email);
            // Just simulate creating
            console.log("User would be created with events:", eventNames);
        } else {
            console.log("User exists, would update with events:", eventNames);
        }
        
    } catch(e) {
        console.error("Error in logic:", e);
    }

    process.exit(0);
}
test();
