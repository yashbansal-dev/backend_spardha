require('dotenv').config();
const nodemailer = require('nodemailer');

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

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
            event !== 'Demo Payment' &&
            event !== 'Demo Event'
        );
        eventsText = validEvents.length > 0 ? validEvents.join(', ') : 'General Registration - Spardha\'26';
    } else {
        eventsText = 'General Registration - Spardha\'26';
    }

    console.log(`📧 Email content generation: input events=${JSON.stringify(events)}, final eventsText="${eventsText}"`);

    const ticketLink = orderId ? `https://spardha.jklu.edu.in/payment/success?order_id=${orderId}` : 'https://spardha.jklu.edu.in/ticket';

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                line-height: 1.6; 
                color: #ffffff; 
                margin: 0; 
                padding: 0; 
                background-color: #020617; /* Spardha Dark BG */
            }
            .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background-color: #0f172a; /* Slightly lighter dark for card */
                border-radius: 12px; 
                overflow: hidden; 
                border: 1px solid #334155;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            }
            .header { 
                background: linear-gradient(135deg, #E37233 0%, #d97706 100%); /* Spardha Orange Gradient */
                color: white; 
                padding: 30px; 
                text-align: center; 
            }
            .content { 
                padding: 30px; 
                background-color: #0f172a; 
                color: #e2e8f0;
            }
            .details { 
                background-color: #1e293b; 
                color: #f8fafc; 
                padding: 20px; 
                margin: 20px 0; 
                border-radius: 8px; 
                border-left: 4px solid #E37233; /* Orange Accent */
            }
            .ticket-section { 
                text-align: center; 
                margin: 25px 0; 
                background-color: #1e293b; 
                padding: 25px; 
                border-radius: 12px; 
                border: 1px solid #334155;
            }
            .ticket-button { 
                display: inline-block; 
                background: linear-gradient(135deg, #E37233 0%, #F2995C 100%); 
                color: #ffffff; 
                padding: 15px 35px; 
                text-decoration: none; 
                border-radius: 30px; 
                font-weight: bold; 
                margin: 15px 0;
                box-shadow: 0 4px 15px rgba(227, 114, 51, 0.4); /* Orange Glow */
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .footer { 
                text-align: center; 
                margin-top: 30px; 
                color: #94a3b8; 
                background-color: #020617; 
                padding: 20px; 
                font-size: 14px;
            }
            .events-list { 
                background-color: #020617; /* Darker nested bg */
                color: #fbbf24; /* Amber text for events */
                padding: 15px; 
                border-radius: 6px;
                margin-top: 10px;
                font-family: monospace;
            }
            h1 { margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
            h2 { color: #E37233; margin-top: 0; }
            h3 { color: #f1f5f9; border-bottom: 2px solid #334155; padding-bottom: 10px; display: inline-block; }
            p { color: #cbd5e1; }
            strong { color: #F2995C; }
            a { color: #E37233; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🏆 Welcome to Spardha'26!</h1>
            </div>
            
            <div class="content">
                <h2>Registration Confirmed!</h2>
                <p>Hello <strong>${name}</strong>,</p>
                <p>You are officially registered for <strong>Spardha'26</strong> - The Annual Sports Fest.</p>
                
                <div class="details">
                    <h3>Your Details</h3>
                    <p><strong>Name:</strong> ${name}</p>
                    <div class="events-list">
                        <strong>🏅 Events Registered:</strong><br />
                        ${eventsText}
                    </div>
                </div>
                
                <div class="ticket-section">
                    <h3>🎟️ Your Entry Ticket</h3>
                    <p><strong>Your QR code is attached to this email.</strong></p>
                    <p>Show this code at the entry gate for instant access.</p>
                    <p style="margin-top: 20px;">Or view it online:</p>
                    <a href="${ticketLink}" class="ticket-button">View Ticket</a>
                </div>
                
                <div class="footer">
                    <p><strong>— Team Spardha'26 —</strong></p>
                    <p>Need help? Reply to this email.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;

    const textContent = `
🏆 Welcome to Spardha'26!

Registration Confirmed!
Hello ${name},

You are officially registered for Spardha'26.

Your Details:
Name: ${name}
Events: ${eventsText}

Your Entry Ticket:
Your QR code is attached to this email.
Please save it and show it at the entry gate.

View Ticket Online: ${ticketLink}

—
Team Spardha'26
    `;

    return { htmlContent, textContent };
}

/**
 * Send registration email to user with QR code attachment
 */
async function sendRegistrationEmail(userEmail, userData) {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            throw new Error("Missing EMAIL_USER or EMAIL_PASS in environment variables");
        }

        const { htmlContent, textContent } = generateRegistrationEmailContent(userData);

        const mailOptions = {
            from: `"Spardha'26 Team" <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: '🏆 Welcome to Spardha\'26 - Registration Confirmed',
            text: textContent,
            html: htmlContent,
            attachments: []
        };

        // Add QR code as attachment if available
        if (userData.qrCodeBase64) {
            console.log(`📎 Adding QR code attachment for ${userEmail}`);
            mailOptions.attachments.push({
                filename: `spardha26-ticket-${userData.name.replace(/[^a-zA-Z0-9]/g, '')}.png`,
                content: Buffer.from(userData.qrCodeBase64, 'base64'),
                contentType: "image/png"
            });
            console.log(`✅ QR code attachment added for ${userEmail}`);
        } else {
            console.log(`⚠️ No QR code available for attachment to ${userEmail}`);
        }

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Registration email sent successfully to ${userEmail}. Message ID: ${info.messageId}`);
        return { success: true, result: info };

    } catch (error) {
        console.error(`❌ Failed to send registration email to ${userEmail}:`, error.message);
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
 * Send payment initiation email (using same pattern as working test-email.js)
 */
async function sendPaymentInitiatedEmail(paymentData) {
    const { email: userEmail, otp } = paymentData;

    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            throw new Error("Missing EMAIL_USER or EMAIL_PASS in environment variables");
        }

        const { htmlContent, textContent } = generatePaymentInitiationEmailContent(paymentData);

        const mailOptions = {
            from: `"Spardha'26 Team" <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: otp ? '🔐 Your Spardha\'26 Ticket Access OTP' : '🎉 Welcome to Spardha\'26 - Registration Confirmed',
            text: textContent,
            html: htmlContent,
            attachments: []
        };

        // Add QR code as attachment if available (for non-OTP emails)
        if (!otp && paymentData.qrCodeBase64) {
            console.log(`📎 Adding QR code attachment for ${userEmail}`);
            mailOptions.attachments.push({
                filename: `spardha26-ticket-${paymentData.name.replace(/[^a-zA-Z0-9]/g, '')}.png`,
                content: Buffer.from(paymentData.qrCodeBase64, 'base64'),
                contentType: "image/png"
            });
            console.log(`✅ QR code attachment added for ${userEmail}`);
        }

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ ${otp ? 'OTP' : 'Payment initiation'} email sent successfully to ${userEmail}. Message ID: ${info.messageId}`);
        return { success: true, result: info };

    } catch (error) {
        console.error(`❌ Failed to send ${otp ? 'OTP' : 'payment initiation'} email to ${userEmail}:`, error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    generateRegistrationEmailContent,
    sendRegistrationEmail,
    generatePaymentInitiationEmailContent,
    sendPaymentInitiatedEmail
};