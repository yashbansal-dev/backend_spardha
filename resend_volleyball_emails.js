
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { User, Purchase } = require('./models/models');
const { sendRegistrationEmail } = require('./utils/emailService');

async function resendVolleyballEmails() {
    try {
        console.log("🚀 Starting Targeted Resend for Volleyball Registrants...");
        
        await mongoose.connect(process.env.mongodb);
        console.log("✅ Connected to MongoDB");

        // Fixed date: March 18, 11:51 AM UTC
        const fixDate = new Date("2026-03-18T11:51:00Z");

        // Find all COMPLETED Volleyball purchases BEFORE the fix date
        const purchases = await Purchase.find({
            purchaseDate: { $lt: fixDate },
            paymentStatus: "completed",
            "items.itemName": /Volleyball/i
        }).populate('userId');

        console.log(`📊 Found ${purchases.length} volleyball purchases to evaluate.`);

        let successCount = 0;
        let failCount = 0;
        let skippedCount = 0;

        for (const purchase of purchases) {
            const email = purchase.userDetails?.email || purchase.userId?.email;
            
            if (!email) {
                console.warn(`⚠️ Skipping order ${purchase.orderId}: No email found.`);
                skippedCount++;
                continue;
            }

            console.log(`📧 Processing ${email} (Order: ${purchase.orderId})...`);

            const user = await User.findOne({ email: email.toLowerCase().trim() });
            
            if (!user) {
                console.warn(`⚠️ Skipping ${email}: User record not found.`);
                skippedCount++;
                continue;
            }

            const emailData = {
                name: user.name,
                events: user.events || [],
                orderId: purchase.orderId,
                qrCodeBase64: null
            };

            if (user.qrPath) {
                try {
                    const qrFilePath = path.join(__dirname, user.qrPath);
                    if (fs.existsSync(qrFilePath)) {
                        const qrBuffer = fs.readFileSync(qrFilePath);
                        emailData.qrCodeBase64 = qrBuffer.toString('base64');
                    }
                } catch (qrErr) {
                    console.warn(`  ⚠️ Could not load QR code for ${email}: ${qrErr.message}`);
                }
            }

            try {
                const result = await sendRegistrationEmail(email, emailData);
                if (result.success) {
                    console.log(`  ✅ Successfully resent email to ${email}`);
                    successCount++;
                } else {
                    console.error(`  ❌ Failed to send email to ${email}:`, result.error || result.errors);
                    failCount++;
                }
            } catch (sendErr) {
                console.error(`  ❌ Exception sending to ${email}: ${sendErr.message}`);
                failCount++;
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log("\n✨ Volleyball Resend Summary:");
        console.log(`   - Successful: ${successCount}`);
        console.log(`   - Failed:     ${failCount}`);
        console.log(`   - Skipped:    ${skippedCount}`);
        console.log(`   - Total:      ${purchases.length}`);

    } catch (error) {
        console.error("💥 Critical Failure:", error);
    } finally {
        await mongoose.disconnect();
    }
}

resendVolleyballEmails();
