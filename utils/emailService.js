require('dotenv').config();
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

// Initialize Resend (Primary Provider)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Create reusable Gmail transporter (Fallback Provider)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Shared helper to send email with Resend primary and Gmail fallback
 */
async function sendEmailWithFallback(options) {
    const { to, subject, text, html, attachments, fromName = "Spardha'26 Team" } = options;
    const errors = [];

    // 1. Try Resend (Primary)
    if (resend) {
        try {
            console.log(`🚀 Attempting Resend for ${to}...`);
            const resendFrom = process.env.RESEND_FROM_EMAIL || 'no-reply@spardha.jklu.edu.in';

            // Format attachments for Resend if they exist
            const resendAttachments = attachments ? attachments.map(att => ({
                filename: att.filename,
                content: att.content.toString('base64') // Resend expects base64 or Buffer
            })) : [];

            const { data, error } = await resend.emails.send({
                from: `${fromName} <${resendFrom}>`,
                to: [to],
                subject: subject,
                text: text,
                html: html,
                attachments: resendAttachments
            });

            if (data) {
                console.log(`✅ Resend success: ${to}. ID: ${data.id}`);
                return { success: true, provider: 'resend', result: data };
            }
            if (error) {
                console.warn(`⚠️ Resend API returned error for ${to}:`, error);
                errors.push({ provider: 'resend', error });
            }
        } catch (err) {
            console.error(`❌ Resend exception for ${to}:`, err.message);
            errors.push({ provider: 'resend', error: err.message });
        }
    } else {
        console.log('ℹ️ Resend API Key not found, skipping primary provider.');
    }

    // 2. Fallback to Gmail
    console.log(`🔄 Falling back to Gmail for ${to}...`);
    try {
        const mailOptions = {
            from: `"${fromName}" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            text: text,
            html: html,
            attachments: attachments || []
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Gmail fallback success: ${to}. ID: ${info.messageId}`);
        return { success: true, provider: 'gmail', result: info };
    } catch (err) {
        console.error(`❌ Gmail fallback also failed for ${to}:`, err.message);
        errors.push({ provider: 'gmail', error: err.message });
    }

    return { success: false, errors };
}

/**
 * Generate registration email content
 */
function generateRegistrationEmailContent(userData) {
    const { name, events, orderId } = userData;

    // Better handling of events data - check for valid array with content
    let eventsText;
    if (Array.isArray(events) && events.length > 0) {
        // Filter out any empty, invalid, or generic event names
        const validEvents = events.filter(event =>
            event &&
            typeof event === 'string' &&
            event.trim().length > 0 &&
            !event.toLowerCase().includes('select') &&
            !event.toLowerCase().includes('none')
        );

        if (validEvents.length > 0) {
            eventsText = validEvents.join(', ');
        } else {
            eventsText = 'General Registration';
        }
    } else if (typeof events === 'string' && events.trim()) {
        eventsText = events;
    } else {
        eventsText = 'General Registration - Spardha\'26';
    }

    console.log(`📧 Email content generation: input events=${JSON.stringify(events)}, final eventsText="${eventsText}"`);

    const ticketLink = orderId ? `https://spardha.jklu.edu.in/payment/success?order_id=${orderId}` : 'https://spardha.jklu.edu.in/ticket';

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Alice&family=Inter:wght@400;700;800;900&display=swap" rel="stylesheet">
        <style>
            body { 
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
                line-height: 1.6; 
                color: #ffffff; 
                margin: 0; 
                padding: 0; 
                background-color: #020617; 
            }
            .wrapper {
                background-color: #020617;
                padding: 20px 10px;
            }
            .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background-color: #0f172a; 
                border-radius: 24px; 
                overflow: hidden; 
                border: 1px solid #1e293b;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            }
            .top-bar {
                padding: 50px 30px 40px;
                text-align: center;
                background: radial-gradient(circle at top, #1e3a8a 0%, #020617 100%);
            }
            .logo-img {
                height: 80px;
                width: auto;
                display: inline-block;
                filter: drop-shadow(0 0 15px rgba(249, 115, 22, 0.4));
            }
            .brand-name {
                font-family: 'Gang of Three', 'Inter', sans-serif;
                font-size: 52px;
                font-weight: 900;
                letter-spacing: 10px;
                color: #ffffff;
                margin: 20px 0 0;
                text-transform: uppercase;
                text-shadow: 0 0 25px rgba(59, 130, 246, 0.9);
            }
            .brand-subtext {
                font-family: 'Inter', sans-serif;
                font-size: 12px;
                color: #f97316;
                text-transform: uppercase;
                letter-spacing: 6px;
                margin-top: 5px;
                font-weight: 800;
            }
            .main-content {
                padding: 50px 30px;
                text-align: center;
                position: relative;
            }
            .success-badge {
                display: inline-block;
                background: rgba(249, 115, 22, 0.1);
                color: #f97316;
                padding: 8px 16px;
                border-radius: 30px;
                font-size: 12px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 2px;
                border: 1px solid rgba(249, 115, 22, 0.2);
                margin-bottom: 20px;
            }
            .welcome-title {
                font-family: 'Alice', serif;
                font-size: 32px;
                color: #ffffff;
                margin: 0 0 10px;
            }
            .highlight {
                color: #f97316;
                font-weight: bold;
            }
            .entry-msg {
                font-size: 16px;
                color: #94a3b8;
                margin: 0 0 40px;
            }
            .details-grid {
                background: rgba(30, 41, 59, 0.5);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 20px;
                padding: 30px;
                text-align: left;
                margin-bottom: 40px;
            }
            .detail-row {
                margin-bottom: 20px;
            }
            .detail-row:last-child {
                margin-bottom: 0;
            }
            .label {
                font-family: 'Inter', sans-serif;
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 2px;
                color: #64748b;
                display: block;
                margin-bottom: 6px;
                font-weight: 800;
            }
            .value {
                font-family: 'Alice', serif;
                font-size: 20px;
                color: #ffffff;
            }
            .qr-section {
                background: #020617;
                border: 1px solid #1e293b;
                border-radius: 24px;
                padding: 40px 20px;
                margin-bottom: 40px;
            }
            .qr-label {
                font-family: 'Inter', sans-serif;
                font-weight: 900;
                color: #ffffff;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 3px;
                margin-bottom: 30px;
            }
            .qr-box {
                background: #ffffff;
                padding: 15px;
                border-radius: 16px;
                display: inline-block;
                margin-bottom: 30px;
                box-shadow: 0 0 30px rgba(249, 115, 22, 0.2);
                border: 2px solid #f97316;
            }
            .qr-info {
                color: #64748b;
                font-size: 13px;
                margin-bottom: 0;
            }
            .cta-btn {
                display: block;
                background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
                color: #ffffff !important;
                text-decoration: none;
                padding: 20px;
                border-radius: 16px;
                font-weight: 900;
                font-size: 16px;
                text-transform: uppercase;
                letter-spacing: 2px;
                box-shadow: 0 15px 30px rgba(234, 88, 12, 0.3);
                margin-bottom: 50px;
            }
            .footer {
                border-top: 1px solid #1e293b;
                padding-top: 40px;
                color: #475569;
                font-size: 12px;
            }
            .team-name {
                font-weight: 900;
                color: #ffffff;
                letter-spacing: 1px;
            }
        </style>
    </head>
    <body>
        <div class="wrapper">
            <div class="container">
                <div class="top-bar">
                    <img src="cid:brand_logo" alt="Spardha" class="logo-img" />
                    <h1 class="brand-name">SPARDHA'26</h1>
                    <div class="brand-subtext">The Annual Sports Fest</div>
                </div>

                <div class="main-content">
                    <div class="success-badge">Entry Granted</div>
                    <h2 class="welcome-title">Welcome, <span class="highlight">${name}</span>!</h2>
                    <p class="entry-msg">You're officially registered for the arena.</p>

                    <div class="details-grid">
                        <div class="detail-row">
                            <span class="label">Registrant Details</span>
                            <span class="value">${name}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Sporting Events</span>
                            <span class="value" style="color: #fbbf24;">${eventsText}</span>
                        </div>
                    </div>

                    <div class="qr-section">
                        <div class="qr-label">Digital Access Pass</div>
                        <div class="qr-box">
                            <img src="cid:qr_code" width="180" height="180" alt="Ticket QR" />
                        </div>
                        <p class="qr-info">Please present this code at the gate</p>
                    </div>

                    <a href="${ticketLink}" class="cta-btn">VIEW TICKET ONLINE</a>

                    <div class="footer">
                        <p class="team-name">— Team Spardha'26 —</p>
                        <p>Questions? Reach us at <a href="mailto:team@spardha.jklu.edu.in" style="color: #f97316; text-decoration: none;">team@spardha.jklu.edu.in</a></p>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;

    const textContent = `
🏆 SPARDHA'26 - The Annual Sports Fest 🏆

REGISTRATION SUCCESSFUL!

Hello ${name},

You are officially registered for Spardha'26.

YOUR DETAILS:
- Name: ${name}
- Events: ${eventsText}

YOUR ENTRY TICKET:
Your QR code pass is attached to this email. Please scan it at the gate for instant access.

View Ticket Online: ${ticketLink}

— Team Spardha'26 —
    `;

    return { htmlContent, textContent };
}

/**
 * Send registration email to user with QR code attachment
 */
async function sendRegistrationEmail(userEmail, userData) {
    try {
        const { htmlContent, textContent } = generateRegistrationEmailContent(userData);
        const attachments = [];

        // 1. Add Brand Logo CID
        const logoPath = path.join(__dirname, '../public/spardha_logo.png');
        if (fs.existsSync(logoPath)) {
            attachments.push({
                filename: 'spardha_logo.png',
                content: fs.readFileSync(logoPath),
                cid: 'brand_logo'
            });
        }

        // 2. Add QR code as CID attachment if available
        if (userData.qrCodeBase64) {
            attachments.push({
                filename: `spardha26-ticket-${userData.name.replace(/[^a-zA-Z0-9]/g, '')}.png`,
                content: Buffer.from(userData.qrCodeBase64, 'base64'),
                contentType: "image/png",
                cid: 'qr_code'
            });
        }

        const result = await sendEmailWithFallback({
            to: userEmail,
            subject: '🏆 Welcome to Spardha\'26 - Registration Confirmed',
            text: textContent,
            html: htmlContent,
            attachments: attachments
        });

        return result;

    } catch (error) {
        console.error(`❌ Global error sending registration email to ${userEmail}:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Generate payment initiation email content (simplified like test-email.js)
 */
function generatePaymentInitiationEmailContent(paymentData) {
    const { name, otp, events } = paymentData;

    // If OTP is provided, send OTP email, otherwise send registration email
    if (otp) {
        // OTP emails are focused on authentication only - no event information needed

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🔐 Your Spardha'26 Ticket Access OTP</title>
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    line-height: 1.6; 
                    color: #ffffff; 
                    margin: 0; 
                    padding: 0; 
                    background-color: #020617; /* Spardha BG */
                }
                .container { 
                    max-width: 600px; 
                    margin: 0 auto; 
                    background-color: #0f172a; 
                    border-radius: 12px; 
                    overflow: hidden; 
                    border: 1px solid #334155;
                }
                .header { 
                    background: linear-gradient(135deg, #E37233 0%, #d97706 100%); 
                    color: white; 
                    padding: 30px; 
                    text-align: center; 
                }
                .content { 
                    padding: 30px; 
                    background-color: #0f172a; 
                    color: #e2e8f0;
                }
                .otp-section { 
                    background-color: #1e293b; 
                    padding: 20px; 
                    border-radius: 8px; 
                    margin: 20px 0; 
                    text-align: center; 
                    border: 1px solid #E37233;
                }
                .otp-code { 
                    font-size: 32px; 
                    font-weight: bold; 
                    color: #E37233; 
                    letter-spacing: 5px; 
                    margin: 10px 0; 
                    background-color: #020617; 
                    padding: 15px; 
                    border-radius: 8px; 
                    border: 1px dashed #475569;
                }
                .footer { 
                    text-align: center; 
                    margin-top: 30px; 
                    color: #94a3b8; 
                    background-color: #020617; 
                    padding: 20px; 
                    font-size: 14px;
                }
                .warning { 
                    background-color: #450a0a; 
                    border: 1px solid #f87171; 
                    color: #fecaca; 
                    padding: 15px; 
                    border-radius: 8px; 
                    margin: 20px 0; 
                    font-size: 13px;
                }
                h1 { margin: 0; }
                h2 { color: #E37233; }
                strong { color: #F2995C; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 Ticket Access OTP</h1>
                    <p>Your secure access code</p>
                </div>
                <div class="content">
                    <h2>Hello <strong>${name}</strong>,</h2>
                    <p>Use this OTP to access your tickets. Valid for 10 minutes.</p>
                    
                    <div class="otp-section">
                        <h3>Your OTP:</h3>
                        <div class="otp-code">${otp}</div>
                    </div>
                    
                    <div class="warning">
                        <strong>⚠️ Security Notice:</strong>
                        <ul style="text-align: left; margin: 10px 0; padding-left: 20px;">
                            <li>Do not share this code.</li>
                            <li>Expires in 10 minutes.</li>
                        </ul>
                    </div>
                    
                    <div class="footer">
                        <p><strong>— Team Spardha'26 —</strong></p>
                    </div>
                </div>
            </div>
        </body>
        </html>`;

        const textContent = `
🔐 Ticket Access OTP - Spardha'26

Hello ${name},

Your OTP Code: ${otp}

Valid for 10 minutes. Do not share.

—
Team Spardha'26`;

        return { htmlContent, textContent };
    } else {
        // Fallback to Main Registration Email logic (DRY)
        return generateRegistrationEmailContent(paymentData);
    }
}

/**
 * Send payment initiation email
 */
async function sendPaymentInitiatedEmail(paymentData) {
    const { email: userEmail, otp } = paymentData;

    try {
        const { htmlContent, textContent } = generatePaymentInitiationEmailContent(paymentData);
        const attachments = [];

        // Add attachments (only for non-OTP emails)
        if (!otp) {
            // 1. Add Brand Logo CID
            const logoPath = path.join(__dirname, '../public/spardha_logo.png');
            if (fs.existsSync(logoPath)) {
                attachments.push({
                    filename: 'spardha_logo.png',
                    content: fs.readFileSync(logoPath),
                    cid: 'brand_logo'
                });
            }

            // 2. Add QR code as CID attachment
            if (paymentData.qrCodeBase64) {
                attachments.push({
                    filename: `spardha26-ticket-${paymentData.name.replace(/[^a-zA-Z0-9]/g, '')}.png`,
                    content: Buffer.from(paymentData.qrCodeBase64, 'base64'),
                    contentType: "image/png",
                    cid: 'qr_code'
                });
            }
        }

        const result = await sendEmailWithFallback({
            to: userEmail,
            subject: otp ? '🔐 Your Spardha\'26 Ticket Access OTP' : '🎉 Welcome to Spardha\'26 - Registration Confirmed',
            text: textContent,
            html: htmlContent,
            attachments: attachments
        });

        return result;

    } catch (error) {
        console.error(`❌ Global error sending ${otp ? 'OTP' : 'payment initiation'} email to ${userEmail}:`, error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    generateRegistrationEmailContent,
    sendRegistrationEmail,
    generatePaymentInitiationEmailContent,
    sendPaymentInitiatedEmail
};