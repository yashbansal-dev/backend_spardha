require('dotenv').config();
const nodemailer = require('nodemailer');
const axios = require('axios');

class MicrosoftOAuthMailer {
    constructor(config) {
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.tenantId = config.tenantId;
        this.userEmail = config.userEmail;
        this.accessToken = null;
    }

    /**
     * Get OAuth2 access token from Microsoft
     */
    async getAccessToken() {
        const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
        
        const params = new URLSearchParams();
        params.append('client_id', this.clientId);
        params.append('client_secret', this.clientSecret);
        params.append('scope', process.env.OAUTH_SCOPE || 'https://graph.microsoft.com/.default');
        params.append('grant_type', 'client_credentials');

        try {
            const response = await axios.post(tokenUrl, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                // Force IPv4 to avoid IPv6 connectivity issues
                family: 4
            });

            this.accessToken = response.data.access_token;
            console.log('✅ Access token obtained successfully');
            return this.accessToken;
        } catch (error) {
            console.error('❌ Error getting access token:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Send email using Microsoft Graph API
     */
    async sendEmailGraph(mailOptions) {
        try {
            // Get fresh access token
            await this.getAccessToken();

            const graphUrl = `https://graph.microsoft.com/v1.0/users/${this.userEmail}/sendMail`;

            const emailPayload = {
                message: {
                    subject: mailOptions.subject,
                    body: {
                        contentType: mailOptions.html ? 'HTML' : 'Text',
                        content: mailOptions.html || mailOptions.text
                    },
                    toRecipients: Array.isArray(mailOptions.to) 
                        ? mailOptions.to.map(email => ({ emailAddress: { address: email } }))
                        : [{ emailAddress: { address: mailOptions.to } }],
                    ccRecipients: mailOptions.cc 
                        ? (Array.isArray(mailOptions.cc) 
                            ? mailOptions.cc.map(email => ({ emailAddress: { address: email } }))
                            : [{ emailAddress: { address: mailOptions.cc } }])
                        : [],
                    bccRecipients: mailOptions.bcc 
                        ? (Array.isArray(mailOptions.bcc) 
                            ? mailOptions.bcc.map(email => ({ emailAddress: { address: email } }))
                            : [{ emailAddress: { address: mailOptions.bcc } }])
                        : [],
                    attachments: mailOptions.attachments || []
                }
            };

            console.log('📧 Sending email via Graph API...');
            const response = await axios.post(graphUrl, emailPayload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                // Force IPv4 to avoid IPv6 connectivity issues
                family: 4
            });

            console.log('✅ Email sent successfully via Graph API');
            return response.data;

        } catch (error) {
            console.error('❌ Graph API Error:', error.response?.data || error.message);
            throw error;
        }
    }
}

/**
 * Generate registration email content
 */
function generateRegistrationEmailContent(userData) {
    const { name, events } = userData;
    
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
        eventsText = validEvents.length > 0 ? validEvents.join(', ') : 'General Registration - Sabrang\'25';
    } else {
        eventsText = 'General Registration - Sabrang\'25';
    }
    
    console.log(`📧 Email content generation: input events=${JSON.stringify(events)}, final eventsText="${eventsText}"`);

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                color: #ffffff; 
                margin: 0; 
                padding: 0; 
                background-color: #1e3a8a;
            }
            .container { 
                max-width: 600px; 
                margin: 0 auto; 
                padding: 20px; 
                background-color: #1e3a8a;
            }
            .header { 
                background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); 
                color: white; 
                padding: 30px; 
                text-align: center; 
                border-radius: 10px 10px 0 0; 
                border: 2px solid #60a5fa;
            }
            .content { 
                background-color: #2563eb; 
                color: #ffffff; 
                padding: 30px; 
                border-radius: 0 0 10px 10px; 
                border: 2px solid #60a5fa; 
                border-top: none;
            }
            .details { 
                background-color: #1d4ed8; 
                color: #ffffff; 
                padding: 20px; 
                margin: 20px 0; 
                border-radius: 8px; 
                border: 2px solid #60a5fa;
            }
            .ticket-section { 
                text-align: center; 
                margin: 20px 0; 
                background-color: #1e40af; 
                padding: 20px; 
                border-radius: 8px; 
                border: 2px solid #60a5fa;
            }
            .ticket-button { 
                display: inline-block; 
                background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); 
                color: #1e3a8a; 
                padding: 15px 30px; 
                text-decoration: none; 
                border-radius: 25px; 
                font-weight: bold; 
                margin: 10px 0;
                border: 2px solid #fcd34d;
            }
            .footer { 
                text-align: center; 
                margin-top: 30px; 
                color: #e0e7ff; 
                background-color: #1e40af; 
                padding: 20px; 
                border-radius: 8px; 
                border: 2px solid #60a5fa;
            }
            .events-list { 
                background-color: #3730a3; 
                color: #ffffff; 
                padding: 15px; 
                border-left: 4px solid #fbbf24; 
                margin: 10px 0; 
                border-radius: 5px;
            }
            h1, h2, h3 { color: #ffffff; }
            p { color: #ffffff; }
            strong { color: #fbbf24; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Welcome to Sabrang'25!</h1>
                <p>Thanks for registering — you're officially part of the fest where the unseen comes to life.</p>
            </div>
            
            <div class="content">
                <h2>Registration Confirmed!</h2>
                <p>Hi <strong>${name}</strong>,</p>
                <p>We're thrilled to have you join us for <strong>Sabrang'25</strong> — a three-day celebration of talent, creativity, and unforgettable vibes at JKLU, Jaipur.</p>
                
                <div class="details">
                    <h3>Your Registration Details:</h3>
                    <p><strong>Name:</strong> ${name}</p>
                    <div class="events-list">
                        <strong>Events Registered:</strong><br />
                        ${eventsText}
                    </div>
                </div>
                
                <div class="ticket-section">
                    <h3>Your Entry Ticket:</h3>
                    <p><strong>Your QR code is attached to this email as an image!</strong></p>
                    <p>Please save the attached QR code image and show it at the entry gate for quick access.</p>
                    <p style="margin-top: 15px;">You can also access your ticket online:</p>
                    <a href="https://sabrang.jklu.edu.in/ticket" class="ticket-button">View Ticket Online</a>
                </div>
                
                <div class="footer">
                    <p><strong>🎊 We can't wait to see you bring your energy, your talent, and your vibe to Sabrang'25.</strong></p>
                    
                    <p><strong>—<br>Team Sabrang'25<br>✨ Witness the Unseen</strong></p>
                    
                    <p>Need help or have a question? Reach out to us anytime.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;

    const textContent = `
🎉 Welcome to Sabrang'25!
Thanks for registering — you're officially part of the fest where the unseen comes to life.

Registration Confirmed!
Hi ${name},

We're thrilled to have you join us for Sabrang'25 — a three-day celebration of talent, creativity, and unforgettable vibes at JKLU, Jaipur.

Your Registration Details:
Name: ${name}

Events Registered:
${eventsText}

Your Entry Ticket:
Your QR code is attached to this email as an image!
Please save the attached QR code image and show it at the entry gate for quick access.

You can also access your ticket online: https://sabrang.jklu.edu.in/ticket

🎊 We can't wait to see you bring your energy, your talent, and your vibe to Sabrang'25.

—
Team Sabrang'25
✨ Witness the Unseen

Need help or have a question? Reach out to us anytime.
    `;

    return { htmlContent, textContent };
}

/**
 * Send registration email to user with QR code attachment
 */
async function sendRegistrationEmail(userEmail, userData) {
    try {
        // Configuration from environment variables
        const config = {
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            tenantId: process.env.TENANT_ID,
            userEmail: process.env.FROM_EMAIL
        };

        // Validate required environment variables
        const requiredEnvVars = ['CLIENT_ID', 'CLIENT_SECRET', 'TENANT_ID', 'FROM_EMAIL'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        const mailer = new MicrosoftOAuthMailer(config);
        const { htmlContent, textContent } = generateRegistrationEmailContent(userData);

        const mailOptions = {
            to: userEmail,
            subject: '🎉 Registration Confirmed - Sabrang\'25',
            text: textContent,
            html: htmlContent,
            attachments: []
        };

        // Add QR code as attachment if available
        if (userData.qrCodeBase64) {
            console.log(`📎 Adding QR code attachment for ${userEmail}`);
            mailOptions.attachments.push({
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: `sabrang25-ticket-${userData.name.replace(/[^a-zA-Z0-9]/g, '')}.png`,
                contentType: "image/png",
                contentBytes: userData.qrCodeBase64
            });
            console.log(`✅ QR code attachment added for ${userEmail}`);
        } else {
            console.log(`⚠️ No QR code available for attachment to ${userEmail}`);
        }

        const result = await mailer.sendEmailGraph(mailOptions);
        console.log(`✅ Registration email sent successfully to ${userEmail} with ${mailOptions.attachments.length} attachments`);
        return { success: true, result };

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
            <title>🔐 Your Sabrang'25 Ticket Access OTP</title>
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    line-height: 1.6; 
                    color: #ffffff; 
                    margin: 0; 
                    padding: 0; 
                    background-color: #1e3a8a;
                }
                .container { 
                    max-width: 600px; 
                    margin: 0 auto; 
                    background-color: #1e3a8a; 
                    border-radius: 10px; 
                    overflow: hidden; 
                    border: 2px solid #60a5fa;
                }
                .header { 
                    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); 
                    color: white; 
                    padding: 30px; 
                    text-align: center; 
                }
                .content { 
                    padding: 30px; 
                    background-color: #2563eb; 
                    color: #ffffff;
                }
                .otp-section { 
                    background-color: #1d4ed8; 
                    padding: 20px; 
                    border-radius: 8px; 
                    margin: 20px 0; 
                    text-align: center; 
                    border: 2px solid #60a5fa;
                }
                .otp-code { 
                    font-size: 32px; 
                    font-weight: bold; 
                    color: #fbbf24; 
                    letter-spacing: 5px; 
                    margin: 10px 0; 
                    background-color: #1e40af; 
                    padding: 15px; 
                    border-radius: 8px; 
                    border: 2px solid #fcd34d;
                }
                .footer { 
                    text-align: center; 
                    margin-top: 30px; 
                    color: #e0e7ff; 
                    background-color: #1e40af; 
                    padding: 20px; 
                    border-radius: 8px; 
                    border: 2px solid #60a5fa;
                }
                .warning { 
                    background-color: #dc2626; 
                    border: 2px solid #fca5a5; 
                    color: #ffffff; 
                    padding: 15px; 
                    border-radius: 8px; 
                    margin: 20px 0; 
                }
                .events-list { 
                    background-color: #3730a3; 
                    color: #ffffff; 
                    padding: 15px; 
                    border-left: 4px solid #fbbf24; 
                    margin: 20px 0; 
                    border-radius: 8px;
                }
                h1, h2, h3 { color: #ffffff; }
                p { color: #ffffff; }
                strong { color: #fbbf24; }
                ul { color: #ffffff; }
                li { color: #ffffff; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 Ticket Access OTP</h1>
                    <p>Your secure access code for Sabrang'25 tickets</p>
                </div>
                <div class="content">
                    <h2>Hello <strong>${name}</strong>,</h2>
                    <p>You've requested access to view your Sabrang'25 tickets. Please use the following OTP to verify your identity:</p>
                    

                    
                    <div class="otp-section">
                        <h3>Your OTP Code:</h3>
                        <div class="otp-code">${otp}</div>
                        <p><strong>This OTP is valid for 10 minutes only.</strong></p>
                    </div>
                    
                    <div class="warning">
                        <strong>Security Notice:</strong>
                        <ul style="text-align: left; margin: 10px 0;">
                            <li>Do not share this OTP with anyone</li>
                            <li>OTP expires in 10 minutes</li>
                            <li>Maximum 3 attempts allowed</li>
                            <li>If you didn't request this, please ignore this email</li>
                        </ul>
                    </div>
                    
                    <div class="footer">
                        <p><strong>—<br>Team Sabrang'25<br>✨ Witness the Unseen</strong></p>
                        <p>Need help? Contact us anytime.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>`;

        const textContent = `
🔐 Ticket Access OTP - Sabrang'25

Hello ${name},

You've requested access to view your Sabrang'25 tickets. Please use the following OTP to verify your identity:



Your OTP Code: ${otp}

This OTP is valid for 10 minutes only.

Security Notice:
- Do not share this OTP with anyone
- OTP expires in 10 minutes
- Maximum 3 attempts allowed
- If you didn't request this, please ignore this email

—
Team Sabrang'25
✨ Witness the Unseen

Need help? Contact us anytime.`;

        return { htmlContent, textContent };
    } else {
        // Original registration email content - better events handling
        let eventsText;
        if (Array.isArray(events) && events.length > 0) {
            const validEvents = events.filter(event => 
                event && 
                typeof event === 'string' && 
                event.trim().length > 0 &&
                event !== 'Demo Payment' &&
                event !== 'Demo Event'
            );
            eventsText = validEvents.length > 0 ? validEvents.join(', ') : 'General Registration - Sabrang\'25';
        } else {
            eventsText = 'General Registration - Sabrang\'25';
        }
        
        console.log(`📧 Payment initiation email: input events=${JSON.stringify(events)}, final eventsText="${eventsText}"`);

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🎉 Welcome to Sabrang'25!</title>
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    line-height: 1.6; 
                    color: #ffffff; 
                    margin: 0; 
                    padding: 0; 
                    background-color: #1e3a8a;
                }
                .container { 
                    max-width: 600px; 
                    margin: 0 auto; 
                    background-color: #1e3a8a; 
                    border-radius: 10px; 
                    overflow: hidden; 
                    border: 2px solid #60a5fa;
                }
                .header { 
                    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); 
                    color: white; 
                    padding: 30px; 
                    text-align: center; 
                }
                .content { 
                    padding: 30px; 
                    background-color: #2563eb; 
                    color: #ffffff;
                }
                .order-details { 
                    background-color: #1d4ed8; 
                    padding: 20px; 
                    border-radius: 8px; 
                    margin: 20px 0; 
                    border: 2px solid #60a5fa;
                }
                .footer { 
                    text-align: center; 
                    margin-top: 30px; 
                    color: #e0e7ff; 
                    background-color: #1e40af; 
                    padding: 20px; 
                    border-radius: 8px; 
                    border: 2px solid #60a5fa;
                }
                .events-list { 
                    background-color: #3730a3; 
                    color: #ffffff; 
                    padding: 15px; 
                    border-left: 4px solid #fbbf24; 
                    margin: 10px 0; 
                    border-radius: 8px;
                }
                .ticket-section { 
                    background-color: #1d4ed8; 
                    padding: 20px; 
                    border-radius: 8px; 
                    margin: 20px 0; 
                    text-align: center; 
                    border: 2px solid #60a5fa;
                }
                .ticket-button { 
                    display: inline-block; 
                    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); 
                    color: #1e3a8a; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 25px; 
                    font-weight: bold; 
                    margin: 10px 0; 
                    border: 2px solid #fcd34d;
                }
                h1, h2, h3 { color: #ffffff; }
                p { color: #ffffff; }
                strong { color: #fbbf24; }
                a { color: #1e3a8a; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Welcome to Sabrang'25!</h1>
                    <p>Thanks for registering — you're officially part of the fest where the unseen comes to life.</p>
                </div>
                <div class="content">
                    <h2>Registration Confirmed!</h2>
                    <p><strong>Hi ${name},</strong></p>
                    <p>We're thrilled to have you join us for Sabrang'25 — a three-day celebration of talent, creativity, and unforgettable vibes at JKLU, Jaipur.</p>
                    
                    <div class="order-details">
                        <h3>Your Registration Details:</h3>
                        <p><strong>Name:</strong> ${name}</p>
                        <div class="events-list">
                            <strong>Events Registered:</strong><br />
                            ${eventsText}
                        </div>
                    </div>
                    
                    <div class="ticket-section">
                        <h3>Your Entry Ticket:</h3>
                        <p><strong>Your QR code is attached to this email as an image!</strong></p>
                        <p>Please save the attached QR code image and show it at the entry gate for quick access.</p>
                        <p style="margin-top: 15px;">You can also access your ticket online:</p>
                        <a href="https://sabrang.jklu.edu.in/ticket" class="ticket-button">View Ticket Online</a>
                    </div>
                    
                    <div class="footer">
                        <p><strong>🎊 We can't wait to see you bring your energy, your talent, and your vibe to Sabrang'25.</strong></p>
                        
                        <p><strong>—<br>Team Sabrang'25<br>✨ Witness the Unseen</strong></p>
                        
                        <p>Need help or have a question? Reach out to us anytime.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>`;

        const textContent = `
🎉 Welcome to Sabrang'25!
Thanks for registering — you're officially part of the fest where the unseen comes to life.

Registration Confirmed!
Hi ${name},

We're thrilled to have you join us for Sabrang'25 — a three-day celebration of talent, creativity, and unforgettable vibes at JKLU, Jaipur.

Your Registration Details:
Name: ${name}

Events Registered:
${eventsText}

Your Entry Ticket:
Your QR code is attached to this email as an image!
Please save the attached QR code image and show it at the entry gate for quick access.

You can also access your ticket online: https://sabrang.jklu.edu.in/ticket

🎊 We can't wait to see you bring your energy, your talent, and your vibe to Sabrang'25.

—
Team Sabrang'25
✨ Witness the Unseen

Need help or have a question? Reach out to us anytime.`;

        return { htmlContent, textContent };
    }
}

/**
 * Send payment initiation email (using same pattern as working test-email.js)
 */
async function sendPaymentInitiatedEmail(paymentData) {
    const { email: userEmail, otp } = paymentData;
    
    try {
        // Use the same configuration pattern as the working test-email.js
        const config = {
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            tenantId: process.env.TENANT_ID,
            userEmail: process.env.FROM_EMAIL
        };

        // Validate required environment variables (same as test-email.js)
        const requiredEnvVars = ['CLIENT_ID', 'CLIENT_SECRET', 'TENANT_ID', 'FROM_EMAIL'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Use the same mailer pattern as test-email.js
        const mailer = new MicrosoftOAuthMailer(config);
        const { htmlContent, textContent } = generatePaymentInitiationEmailContent(paymentData);

        const mailOptions = {
            to: userEmail,
            subject: otp ? '🔐 Your Sabrang\'25 Ticket Access OTP' : '🎉 Welcome to Sabrang\'25! Registration Confirmed',
            text: textContent,
            html: htmlContent,
            attachments: []
        };

        // Add QR code as attachment if available (for non-OTP emails)
        if (!otp && paymentData.qrCodeBase64) {
            console.log(`📎 Adding QR code attachment for ${userEmail}`);
            mailOptions.attachments.push({
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: `sabrang25-ticket-${paymentData.name.replace(/[^a-zA-Z0-9]/g, '')}.png`,
                contentType: "image/png",
                contentBytes: paymentData.qrCodeBase64
            });
            console.log(`✅ QR code attachment added for ${userEmail}`);
        }

        // Use the same sending method as test-email.js
        const result = await mailer.sendEmailGraph(mailOptions);
        console.log(`✅ ${otp ? 'OTP' : 'Payment initiation'} email sent successfully to ${userEmail}`);
        return { success: true, result };

    } catch (error) {
        console.error(`❌ Failed to send ${otp ? 'OTP' : 'payment initiation'} email to ${userEmail}:`, error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    MicrosoftOAuthMailer,
    generateRegistrationEmailContent,
    sendRegistrationEmail,
    generatePaymentInitiationEmailContent,
    sendPaymentInitiatedEmail
};