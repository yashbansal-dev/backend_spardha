require('dotenv').config();
const nodemailer = require('nodemailer');
const { sendRegistrationEmail } = require('./utils/emailService');
const { generateUserQRCode } = require('./utils/qrCodeService');

async function runTest() {
    console.log('===========================================');
    console.log('EMAIL LIVE TEST');
    console.log('===========================================');
    console.log('EMAIL_USER:', process.env.EMAIL_USER);
    console.log('EMAIL_PASS set:', !!process.env.EMAIL_PASS, '(length:', process.env.EMAIL_PASS?.length, ')');
    console.log('');

    // Step 1: Test SMTP connection
    console.log('STEP 1: Testing SMTP connection...');
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    try {
        await transporter.verify();
        console.log('✅ SMTP Connection OK - Gmail is accepting credentials');
    } catch (err) {
        console.log('❌ SMTP Connection FAILED:', err.message);
        process.exit(1);
    }

    // Step 2: Test QR code generation
    console.log('');
    console.log('STEP 2: Testing QR code generation...');
    let qrBase64 = null;
    try {
        qrBase64 = await generateUserQRCode('test_user_123', {
            name: 'Test User',
            email: process.env.EMAIL_USER,
            events: ['Football', 'Cricket'],
            orderId: 'order_TEST123'
        });
        console.log('✅ QR code generated, length:', qrBase64.length);
    } catch (err) {
        console.log('❌ QR code generation FAILED:', err.message);
    }

    // Step 3: Send a real test registration email to yourself
    console.log('');
    console.log('STEP 3: Sending test registration email to:', process.env.EMAIL_USER);
    try {
        const result = await sendRegistrationEmail(process.env.EMAIL_USER, {
            name: 'Test User (Live Test)',
            email: process.env.EMAIL_USER,
            events: ['Football', 'Cricket', 'Badminton'],
            qrCodeBase64: qrBase64,
            orderId: 'order_TEST123'
        });

        if (result.success) {
            console.log('✅ EMAIL SENT SUCCESSFULLY!');
            console.log('   Message ID:', result.result.messageId);
            console.log('');
            console.log('===========================================');
            console.log('✅ ALL TESTS PASSED - Email system is 100% working!');
            console.log('===========================================');
        } else {
            console.log('❌ Email FAILED:', result.error);
            process.exit(1);
        }
    } catch (err) {
        console.log('❌ Email send error:', err.message);
        process.exit(1);
    }
}

runTest();
