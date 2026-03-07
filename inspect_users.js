
require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase, User } = require('./models/models');

const inspectUsers = async () => {
    try {
        await mongoose.connect(process.env.mongodb);
        const emails = ['uduthalaashwit@gmail.com', 'kavitasharma946214@gmail.com', 'garvitagrawal@jklu.edu.in'];

        for (const email of emails) {
            const user = await User.findOne({ email });
            console.log(`\n--- User: ${email} ---`);
            if (user) {
                console.log(`Name: ${user.name}`);
                console.log(`Events: ${JSON.stringify(user.events)}`);
                console.log(`EmailSent: ${user.emailSent}`);
                console.log(`RegistrationHistory: ${JSON.stringify(user.registrationHistory)}`);

                const purchases = await Purchase.find({
                    $or: [
                        { userId: user._id },
                        { 'userDetails.email': email }
                    ]
                });
                console.log(`Linked Purchases: ${purchases.length}`);
                purchases.forEach(p => {
                    console.log(`  - Order: ${p.orderId} | Status: ${p.paymentStatus} | EmailSent: ${p.emailSent}`);
                });
            } else {
                console.log('User not found');
            }
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

inspectUsers();
