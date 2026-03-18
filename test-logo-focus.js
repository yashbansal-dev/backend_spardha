const { sendRegistrationEmail } = require('./utils/emailService');

const testUserData = {
    name: "Yash Bansal",
    events: ["Tournament Finale", "Closing Ceremony"],
    orderId: "BRAND_V4_LOGOFOCUS",
    // Small 1x1 red dot PNG base64 for testing CID attachment
    qrCodeBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
};

const testEmail = "yashbansal531@gmail.com";

async function runTest() {
    console.log(`🧪 Starting Logo-Focused (v4) verification for ${testEmail}...`);
    
    const result = await sendRegistrationEmail(testEmail, testUserData);
    
    if (result.success) {
        console.log(`✅ Logo-Focused v4 success: ${result.provider}`);
        console.log(`📧 Check your inbox to verify:`);
        console.log(`   - Enlarged logo (80px height)`);
        console.log(`   - Centered branding section`);
        console.log(`   - No hero image (removed)`);
        console.log(`   - "SPARDHA'26" title prominence`);
    } else {
        console.error(`❌ Logo-Focused v4 failed:`, result.errors || result.error);
    }
}

runTest();
