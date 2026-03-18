const { sendRegistrationEmail } = require('./utils/emailService');

const testUserData = {
    name: "Yash Bansal",
    events: ["Tournament Finale", "Closing Ceremony"],
    orderId: "BRAND_V3_TEST",
    // Small 1x1 red dot PNG base64 for testing CID attachment
    qrCodeBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
};

const testEmail = "yashbansal531@gmail.com";

async function runTest() {
    console.log(`🧪 Starting Branded Premium (v3) verification for ${testEmail}...`);
    
    const result = await sendRegistrationEmail(testEmail, testUserData);
    
    if (result.success) {
        console.log(`✅ Branded v3 success: ${result.provider}`);
        console.log(`📧 Check your inbox to verify:`);
        console.log(`   - Logo in top-left corner`);
        console.log(`   - "SPARDHA'26" title font style`);
        console.log(`   - Alice/Inter font fallbacks`);
        console.log(`   - Hero image and QR code display`);
    } else {
        console.error(`❌ Branded v3 failed:`, result.errors || result.error);
    }
}

runTest();
