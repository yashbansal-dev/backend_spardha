require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase, User } = require('./models/models');
const { sendRegistrationEmail } = require('./utils/emailService');
const { generateUserQRCode } = require('./utils/qrCodeService');
const nodemailer = require('nodemailer');

// First, test that email credentials work
const testEmailCredentials = async () => {
    console.log('🔧 Testing email credentials...');
    console.log(`📧 EMAIL_USER: ${process.env.EMAIL_USER}`);
    console.log(`🔑 EMAIL_PASS: ${process.env.EMAIL_PASS ? '***' + process.env.EMAIL_PASS.slice(-4) : 'NOT SET'}`);

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    try {
        await transporter.verify();
        console.log('✅ Email credentials are valid!');
        return true;
    } catch (err) {
        console.error('❌ Email credentials FAILED:', err.message);
        return false;
    }
};

const retryEmail = async (orderId) => {
    try {
        await mongoose.connect(process.env.mongodb);
        console.log('✅ Connected to DB');

        // First, test credentials
        const emailWorking = await testEmailCredentials();
        if (!emailWorking) {
            console.error('❌ Fix email credentials before retrying.');
            return;
        }

        const purchase = await Purchase.findOne({ orderId: orderId });
        if (!purchase) {
            console.error('❌ Order not found:', orderId);
            return;
        }

        const user = await User.findOne({ email: purchase.userDetails.email });
        if (!user) {
            console.error('❌ User not found for this purchase');
            return;
        }

        console.log(`👤 User found: ${user.name} (${user.email})`);
        console.log(`📅 Events: ${user.events}`);

        // Regenerate QR with orderId
        console.log(`🔄 Regenerating QR Code for ${user.email}...`);
        const newQrCodeBase64 = await generateUserQRCode(user._id, {
            name: user.name,
            email: user.email,
            events: user.events || [],
            orderId: purchase.orderId
        });

        user.qrCodeBase64 = newQrCodeBase64;
        await user.save();
        console.log('✅ QR Code regenerated.');

        const emailData = {
            name: user.name,
            email: user.email,
            events: user.events || [],
            qrCodeBase64: newQrCodeBase64,
            orderId: purchase.orderId
        };

        console.log(`📧 Sending email to ${user.email}...`);
        const result = await sendRegistrationEmail(user.email, emailData);

        if (result.success) {
            console.log('✅ Email sent successfully!');
        } else {
            console.error('❌ Failed to send email:', result.error);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

// Replace with the new order ID
retryEmail('order_87dc80135ffa');
