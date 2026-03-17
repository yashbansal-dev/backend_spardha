const express = require('express');
const crypto = require('crypto');
const { Cashfree, CFEnvironment } = require('cashfree-pg');
const { User, Purchase, TeamComposition, Event } = require('../models/models');
const { sendRegistrationEmail } = require('../utils/emailService');
const { generateUserQRCode } = require('../utils/qrCodeService');
const { verifyAdmin } = require('../middleware/auth');
const qr = require('qr-image');
const fs = require('fs');
const path = require('path');
const shortid = require('shortid');
const router = express.Router();

// -----------------------------------------------------------------------
// SHARED HELPER: Process a completed payment (QR + Email)
// Called from both GET /success/:orderId and the Webhook handler
// -----------------------------------------------------------------------
async function processPaymentSuccess(orderId, paymentData = null) {
    console.log('🎉 processPaymentSuccess called for order:', orderId);

    const purchase = await Purchase.findOne({ orderId });
    if (!purchase) {
        console.error('❌ Purchase not found for orderId:', orderId);
        return { success: false, message: 'Purchase not found' };
    }

    // Update transaction details if provided (even if already completed, to backfill missing data)
    let updatedFields = false;
    if (paymentData) {
        if (paymentData.transactionId && purchase.transactionId !== paymentData.transactionId) {
            purchase.transactionId = paymentData.transactionId;
            updatedFields = true;
        }
        if (paymentData.paymentMethod && purchase.paymentMethod !== paymentData.paymentMethod) {
            purchase.paymentMethod = paymentData.paymentMethod;
            updatedFields = true;
        }
    }

    // Skip full processing ONLY if already fully processed (payment done + email sent)
    if (purchase.paymentStatus === 'completed' && purchase.emailSent === true) {
        if (updatedFields) {
            await purchase.save();
            console.log('✅ Updated transaction details for already completed order:', orderId);
        }
        console.log('✅ Payment already fully processed (email sent) for order:', orderId);
        return { success: true, alreadyProcessed: true, purchase };
    }

    // Mark as completed
    if (purchase.paymentStatus !== 'completed') {
        purchase.paymentStatus = 'completed';
        purchase.paymentCompletedAt = new Date();
        updatedFields = true;
    }

    // Extract event names from purchase items
    const eventNames = purchase.items.map(item => item.itemName).filter(name => name && name !== 'Demo Payment');
    console.log('📝 Extracted event names from purchase:', eventNames);

    // Find or create the main user
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
        user = new User({
            name: purchase.userDetails.name,
            email: purchase.userDetails.email,
            contactNo: purchase.userDetails.contactNo || '',
            gender: purchase.userDetails.gender || '',
            age: purchase.userDetails.age || null,
            universityName: purchase.userDetails.universityName || '',
            address: purchase.userDetails.address || '',
            universityIdCard: purchase.userDetails.formData?.universityIdCard || '',
            referralCode: purchase.userDetails.formData?.referralCode || '',
            referalID: shortid.generate(), // 🔥 Generate their OWN referral code
            events: eventNames.length > 0 ? eventNames : ['General Registration'],
            isvalidated: true
        });
    } else {
        user.isvalidated = true; // ✅ Mark as validated on successful payment
        if (!user.referalID) user.referalID = shortid.generate(); // ✅ Ensure they have a referral ID
        if (purchase.userDetails.contactNo) user.contactNo = purchase.userDetails.contactNo;
        if (purchase.userDetails.gender) user.gender = purchase.userDetails.gender;
        if (purchase.userDetails.age) user.age = purchase.userDetails.age;
        if (purchase.userDetails.universityName) user.universityName = purchase.userDetails.universityName;
        if (purchase.userDetails.address) user.address = purchase.userDetails.address;
        if (purchase.userDetails.formData?.universityIdCard) user.universityIdCard = purchase.userDetails.formData.universityIdCard;
        if (purchase.userDetails.formData?.referralCode) user.referralCode = purchase.userDetails.formData.referralCode;

        if (eventNames.length > 0) {
            const currentEvents = user.events || [];
            const newEvents = eventNames.filter(e => !currentEvents.includes(e));
            if (newEvents.length > 0) {
                user.events = [...currentEvents, ...newEvents];
                console.log('✅ Added new events to existing user:', newEvents);
            }
        } else if (!user.events || user.events.length === 0) {
            user.events = ['General Registration'];
        }
    }

    // Generate QR code for main user — always include orderId for correct URL
    if (!user.qrCodeBase64) {
        try {
            const qrCodeBase64 = await generateUserQRCode(user._id || 'temp', {
                name: user.name,
                email: user.email,
                events: user.events || [],
                orderId: orderId  // ✅ Pass orderId so QR links to the correct ticket page
            });
            user.qrPath = `${user._id}`;
            user.qrCodeBase64 = qrCodeBase64;
            console.log('✅ QR code generated for main user');
        } catch (qrError) {
            console.error('❌ QR code generation failed for main user:', qrError);
        }
    } else {
        console.log('ℹ️ QR code already exists for main user');
    }

    await user.save();

    // Update purchase
    purchase.userId = user._id;
    purchase.qrGenerated = true;
    purchase.qrCodeBase64 = user.qrCodeBase64;
    await purchase.save();
    console.log('✅ Purchase status updated to completed for order:', orderId);

    // Process team registrations
    if (purchase.userDetails.teamMembers) {
        let teamData = purchase.userDetails.teamMembers;
        console.log('👥 Processing Team Registrations...');

        // CRITICAL FIX: frontend sometimes sends teamMembers as an array of objects
        // each object having [eventId]: [members]
        // Examples: 
        // 1. { "event-id": [...] }
        // 2. [ { "event-id": [...] } ]

        let normalizedTeamData = {};
        if (Array.isArray(teamData)) {
            console.log('ℹ️ teamMembers is an array, normalizing...');
            teamData.forEach(item => {
                if (typeof item === 'object') {
                    Object.assign(normalizedTeamData, item);
                }
            });
        } else if (typeof teamData === 'object') {
            normalizedTeamData = teamData;
        }

        for (const [eventId, members] of Object.entries(normalizedTeamData)) {
            if (!Array.isArray(members)) continue;

            const matchedItem = purchase.items.find(i =>
                i.itemId === eventId ||
                String(i.itemId) === String(eventId) ||
                i.itemName === eventId ||
                i.itemName.toLowerCase().replace(/[\(\)\s]/g, '-') === eventId.toLowerCase()
            );

            const eventName = matchedItem ? matchedItem.itemName : eventId;

            console.log(`   🏆 Creating Team for: ${eventName}`);

            const memberObjects = [];
            for (const m of members) {
                if (!m.email) continue;

                let memberUser = await User.findOne({ email: m.email.toLowerCase().trim() });
                if (!memberUser) {
                    memberUser = new User({
                        name: m.name,
                        email: m.email.toLowerCase().trim(),
                        contactNo: m.contactNo || m.phone || '',
                        events: [eventName],
                        isvalidated: false
                    });
                    await memberUser.save();
                    console.log(`      ✨ Created new user for member: ${m.email}`);
                } else {
                    if (!memberUser.events.includes(eventName)) {
                        memberUser.events.push(eventName);
                        await memberUser.save();
                    }
                }
                memberObjects.push({
                    userId: memberUser._id,
                    name: m.name,
                    email: m.email,
                    role: 'member'
                });
            }

            const newTeam = new TeamComposition({
                eventName: eventName,
                teamName: `${user.name}'s Team`,
                teamLeader: { userId: user._id, name: user.name, email: user.email, hasEntered: false },
                teamMembers: memberObjects,
                totalMembers: memberObjects.length + 1,
                purchaseId: purchase._id
            });
            await newTeam.save();

            user.teamRegistrations.push({
                eventName: eventName,
                teamLeaderId: user._id,
                isTeamLeader: true,
                teamName: newTeam.teamName,
                teamCompositionId: newTeam._id
            });
        }
        await user.save();
    }

    // Mark as processed
    purchase.userRegistered = true;
    await purchase.save();

    // ====================================================
    // SEND EMAILS TO ALL USERS (MAIN + MEMBERS)
    // ====================================================
    try {
        const { sendRegistrationEmail } = require('../utils/emailService');

        // 1. Send to Main User
        if (!user.emailSent) {
            const emailData = {
                name: user.name,
                email: user.email,
                events: user.events || ['General Registration'],
                qrCodeBase64: user.qrCodeBase64,
                orderId: purchase.orderId,
                // Additional data for Invoice/Ticket PDF
                universityName: user.universityName || purchase.userDetails?.universityName || '',
                totalAmount: purchase.amount || 0,
                items: (purchase.events || []).map(event => ({
                    itemName: event,
                    price: (purchase.amount || 0) / (purchase.events?.length || 1), // Estimated per-item price
                    quantity: 1
                }))
            };

            const emailResult = await sendRegistrationEmail(user.email, emailData);
            if (emailResult.success) {
                console.log('✅ Registration email sent to main user:', user.email);
                user.emailSent = true;
                user.emailSentAt = new Date();
                await user.save();
                // ✅ Also mark the purchase as email sent (main part)
                purchase.emailSent = true;
                purchase.emailSentAt = new Date();
                await purchase.save();
            } else {
                console.error('❌ Failed to send email to main user:', user.email, emailResult.error);
            }
        } else {
            console.log('ℹ️ Email already sent to main user:', user.email);
        }

        // 2. Send to Team Members
        const teams = await TeamComposition.find({ purchaseId: purchase._id });
        for (const team of teams) {
            console.log(`📧 Processing emails for team: ${team.teamName}`);
            for (const memberRef of team.teamMembers) {
                const member = await User.findById(memberRef.userId);
                if (member && !member.emailSent) {
                    const memberEmailData = {
                        name: member.name,
                        email: member.email,
                        events: member.events || [team.eventName],
                        qrCodeBase64: member.qrCodeBase64,
                        orderId: purchase.orderId,
                        // Additional data for Invoice/Ticket PDF
                        universityName: member.universityName || purchase.userDetails?.universityName || '',
                        totalAmount: purchase.amount || 0,
                        items: (purchase.events || []).map(event => ({
                            itemName: event,
                            price: (purchase.amount || 0) / (purchase.events?.length || 1),
                            quantity: 1
                        }))
                    };

                    const result = await sendRegistrationEmail(member.email, memberEmailData);
                    if (result.success) {
                        console.log(`✅ Registration email sent to member: ${member.email}`);
                        member.emailSent = true;
                        member.emailSentAt = new Date();
                        await member.save();
                    } else {
                        console.error(`❌ Failed to send email to member: ${member.email}`, result.error);
                    }
                } else if (member) {
                    console.log(`ℹ️ Email already sent to member: ${member.email}`);
                }
            }
        }
    } catch (emailError) {
        console.error('❌ Global email sending error in processPaymentSuccess:', emailError);
    }

    // ====================================================
    // DYNAMIC EXCEL REGENERATION (Non-blocking)
    // ====================================================
    try {
        const { generateExcelReport } = require('../utils/excelExport');
        const outputPath = process.env.NODE_ENV === 'production'
            ? '/app/uploads/registrations_export.xlsx'
            : path.join(__dirname, '..', 'public', 'registrations_export.xlsx');

        // Ensure directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        console.log(`📊 Triggering background Excel report regeneration to ${outputPath}...`);
        // We do NOT await this to keep the response fast for the user
        generateExcelReport(outputPath).then(excelResult => {
            if (excelResult.success) {
                console.log('✅ Dynamic Excel report successfully regenerated in background.');
            } else {
                console.error('❌ Failed to regenerate Excel report dynamically in background:', excelResult.error);
            }
        }).catch(err => {
            console.error('❌ Critical error in background Excel regeneration:', err);
        });
    } catch (excelErr) {
        console.error('❌ Error during dynamic Excel regeneration setup:', excelErr);
    }

    return { success: true, purchase, user };
}

// Initialize Cashfree with production credentials
let cashfree;
let isUsingProd = true;

function initializeCashfree(useProd = true) {
    if (useProd) {
        console.log('🔄 Using PRODUCTION credentials...');
        cashfree = new Cashfree(
            CFEnvironment.PRODUCTION,
            process.env.CASHFREE_APP_ID,
            process.env.CASHFREE_SECRET_KEY
        );
        isUsingProd = true;
        console.log('✅ Cashfree initialized with PRODUCTION environment');
    } else {
        console.log('🧪 Fallback to TEST credentials...');
        cashfree = new Cashfree(
            CFEnvironment.SANDBOX,
            process.env.CASHFREE_APP_ID,
            process.env.CASHFREE_SECRET_KEY
        );
        isUsingProd = false;
        console.log('✅ Cashfree initialized with SANDBOX environment');
    }
}

// Start with PRODUCTION credentials
initializeCashfree(true);

console.log('Cashfree SDK initialized:', {
    testClientId: process.env.CASHFREE_CLIENT_ID ? 'Set' : 'Not set',
    testClientSecret: process.env.CASHFREE_CLIENT_SECRET ? 'Set' : 'Not set',
    prodClientId: process.env.CASHFREE_PROD_CLIENT_ID ? 'Set' : 'Not set',
    prodClientSecret: process.env.CASHFREE_PROD_CLIENT_SECRET ? 'Set' : 'Not set',
    currentEnvironment: 'PRODUCTION (with SANDBOX fallback)'
});

// Generate unique order ID using crypto
function generateOrderId() {
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256');
    hash.update(uniqueId);
    const orderId = hash.digest('hex');
    return orderId.substr(0, 12);
}

// Test route


// Get QR code by order ID
router.get('/qr-by-order/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log('Fetching QR code for order:', orderId);

        const purchase = await Purchase.findOne({ orderId: orderId });

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Security check: Only serve QR codes for completed payments
        if (purchase.paymentStatus !== 'completed') {
            console.log(`❌ Access denied: Payment not completed for order ${orderId}`);
            return res.status(403).json({
                success: false,
                message: 'Access denied: Payment not completed'
            });
        }

        if (!purchase.qrCodeBase64) {
            return res.status(404).json({
                success: false,
                message: 'QR code not found for this order'
            });
        }

        // Return QR code as base64 or as image
        const format = req.query.format || 'json';

        if (format === 'image') {
            const qrBuffer = Buffer.from(purchase.qrCodeBase64, 'base64');
            res.set({
                'Content-Type': 'image/png',
                'Content-Length': qrBuffer.length
            });
            res.send(qrBuffer);
        } else {
            res.json({
                success: true,
                data: {
                    purchaseId: purchase._id,
                    orderId: purchase.orderId,
                    qrCodeBase64: purchase.qrCodeBase64,
                    userDetails: {
                        name: purchase.userDetails?.name,
                        email: purchase.userDetails?.email,
                        referralCode: purchase.userDetails?.referralCode
                    },
                    qrGenerated: purchase.qrGenerated,
                    paymentStatus: purchase.paymentStatus
                }
            });
        }

    } catch (error) {
        console.error('❌ Error fetching QR code:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch QR code',
            error: error.message
        });
    }
});

// Get QR code from database
router.get('/qr/:purchaseId', async (req, res) => {
    try {
        const { purchaseId } = req.params;
        console.log('Fetching QR code for purchase:', purchaseId);

        const purchase = await Purchase.findById(purchaseId);

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: 'Purchase not found'
            });
        }

        // Security check: Only serve QR codes for completed payments
        if (purchase.paymentStatus !== 'completed') {
            console.log(`❌ Access denied: Payment not completed for purchase ${purchaseId}`);
            return res.status(403).json({
                success: false,
                message: 'Access denied: Payment not completed'
            });
        }

        if (!purchase.qrCodeBase64) {
            return res.status(404).json({
                success: false,
                message: 'QR code not found for this purchase'
            });
        }

        // Return QR code as base64 or as image
        const format = req.query.format || 'json';

        if (format === 'image') {
            const qrBuffer = Buffer.from(purchase.qrCodeBase64, 'base64');
            res.set({
                'Content-Type': 'image/png',
                'Content-Length': qrBuffer.length
            });
            res.send(qrBuffer);
        } else {
            res.json({
                success: true,
                data: {
                    purchaseId: purchase._id,
                    orderId: purchase.orderId,
                    qrCodeBase64: purchase.qrCodeBase64,
                    userDetails: {
                        name: purchase.userDetails?.name,
                        email: purchase.userDetails?.email
                    },
                    qrGenerated: purchase.qrGenerated,
                    paymentStatus: purchase.paymentStatus
                }
            });
        }

    } catch (error) {
        console.error('❌ Error fetching QR code:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch QR code',
            error: error.message
        });
    }
});

router.get('/', (req, res) => {
    res.json({
        message: 'Cashfree payment routes working',
        environment: process.env.NODE_ENV,
        emailConfig: {
            CLIENT_ID: process.env.CLIENT_ID ? 'SET' : 'MISSING',
            CLIENT_SECRET: process.env.CLIENT_SECRET ? 'SET' : 'MISSING',
            TENANT_ID: process.env.TENANT_ID ? 'SET' : 'MISSING',
            FROM_EMAIL: process.env.FROM_EMAIL || 'MISSING'
        }
    });
});

// Create payment order - Following latest Cashfree docs with fallback
// Create payment order - SECURE SERVER-SIDE PRICING
router.post('/create-order', async (req, res) => {
    try {
        console.log('Create order request:', req.body);

        const {
            customerName,
            customerEmail,
            customerPhone,
            items,
            // Capture other fields
            referralCode,
            customerGender,
            customerAge,
            universityName,
            address,
            teamMembers
        } = req.body;

        // Validate required fields
        if (!customerEmail || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: customerEmail and items array'
            });
        }

        // ---------------------------------------------------------
        // 1. SECURE PRICING: Calculate Total Amount on Server Side
        // ---------------------------------------------------------
        console.log('🔐 Calculating price server-side...');
        let totalAmount = 0;
        let processedItems = [];
        let missingEvents = [];

        for (const item of items) {
            // Identify event by name/title
            const eventName = (item.title || item.itemName || item.name || '').trim();
            const category = (item.category || '').trim();

            if (!eventName) {
                console.warn('⚠️ Item missing name/title:', item);
                continue;
            }

            console.log(`🔍 Searching for event: "${eventName}" (Category: "${category}")`);

            // Helper to escape regex special characters
            const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Smart Lookup Logic:
            let event = null;

            // 1. Try case-insensitive exact match
            event = await Event.findOne({ name: { $regex: `^${escapeRegex(eventName)}$`, $options: 'i' } });

            // 2. Try "Event (Category)" variant
            if (!event && category && category !== 'Open') {
                const specificName = `${eventName} (${category})`;
                console.log(`🔍 Trying specific variant: "${specificName}"`);
                event = await Event.findOne({ name: { $regex: `^${escapeRegex(specificName)}$`, $options: 'i' } });

                // Try reverse: if eventName already has category but frontend sent both
                if (!event && eventName.toLowerCase().includes(category.toLowerCase())) {
                    event = await Event.findOne({ name: { $regex: `^${escapeRegex(eventName)}$`, $options: 'i' } });
                }
            }

            // 3. Last resort: Partial match logic
            if (!event) {
                console.log(`🔍 Trying partial match for: "${eventName}"`);
                // Find all events starting with this name or containing it
                const matches = await Event.find({ name: { $regex: `${escapeRegex(eventName)}`, $options: 'i' } });
                if (matches.length === 1) {
                    event = matches[0];
                    console.log(`✅ Auto-matched partial: "${eventName}" -> "${event.name}"`);
                } else if (matches.length > 1) {
                    // Try to find one that matches the category if available
                    if (category) {
                        event = matches.find(m => m.name.toLowerCase().includes(category.toLowerCase()));
                        if (event) console.log(`✅ Auto-matched multi-partial with category: "${event.name}"`);
                    }
                    // If still no event, pick the first one as a best guess IF it's an exact match in some way
                    if (!event) {
                        event = matches.find(m => m.name.toLowerCase() === eventName.toLowerCase());
                    }
                }
            }

            if (!event) {
                console.error(`❌ Event NOT found: "${eventName}"`);
                missingEvents.push(eventName);
                continue;
            }

            // Trust ONLY the DB price
            const realPrice = parseFloat(event.price || 0);
            const quantity = parseInt(item.quantity) || 1;
            const itemTotal = realPrice * quantity;

            totalAmount += itemTotal;

            processedItems.push({
                type: 'event',
                itemId: event._id,
                itemName: event.name,
                price: realPrice,
                quantity: quantity
            });

            console.log(`   - Verified: "${event.name}" @ ₹${realPrice} x ${quantity} = ₹${itemTotal}`);
        }

        if (missingEvents.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Security Error: Following events not found in database: ${missingEvents.join(', ')}. cannot verify price.`
            });
        }

        if (processedItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid items found to process.'
            });
        }

        console.log(`💰 FINAL VERIFIED TOTAL: ₹${totalAmount}`);


        // ---------------------------------------------------------
        // 2. ROBUST SAVING: Save to DB *BEFORE* Calling Gateway
        // ---------------------------------------------------------
        const orderId = `order_${generateOrderId()}`;

        const newPurchase = new Purchase({
            orderId: orderId,
            userDetails: {
                name: customerName,
                email: customerEmail,
                contactNo: customerPhone,
                gender: customerGender,
                age: customerAge,
                universityName: universityName,
                address: address,
                teamMembers: teamMembers,
                formData: req.body
            },
            items: processedItems,
            subtotal: totalAmount,
            totalAmount: totalAmount,
            currency: "INR",
            paymentStatus: 'pending',
            environment: isUsingProd ? 'production' : 'sandbox',
            metadata: {
                userAgent: req.get('User-Agent'),
                ipAddress: req.ip,  // ✅ matches schema field name
                timestamp: new Date()
            }
        });

        // Attempt Save
        try {
            await newPurchase.save();
            console.log(`✅ Order ${orderId} saved to MongoDB (Pending)`);
        } catch (dbError) {
            console.error('❌ CRITICAL: Failed to save order to DB. Aborting payment.', dbError);
            return res.status(500).json({
                success: false,
                message: 'Internal System Error: Could not save order. Please try again.',
                error: dbError.message
            });
        }


        // ---------------------------------------------------------
        // 3. INITIATE PAYMENT: Call Cashfree
        // ---------------------------------------------------------
        // Sanitize Phone Number (Extract last 10 digits)
        const rawPhone = String(customerPhone || "9999999999").replace(/\D/g, '');
        const cleanPhone = rawPhone.length > 10 ? rawPhone.slice(-10) : rawPhone;

        const orderRequest = {
            order_amount: totalAmount,
            order_currency: "INR",
            order_id: orderId,
            customer_details: {
                customer_id: `cust_${Date.now()}`,
                customer_name: customerName || "Customer",
                customer_email: customerEmail,
                customer_phone: cleanPhone
            },
            order_meta: {
                // FORCE return to frontend URL to avoid any environment variable ambiguity
                return_url: `https://spardha.jklu.edu.in/payment/success?order_id=${orderId}`
            }
        };

        let response;
        try {
            // Using existing logic with simple race timeout
            const createOrderWithTimeout = async (orderReq) => {
                return Promise.race([
                    cashfree.PGCreateOrder(orderReq),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Cashfree API timeout')), 30000)
                    )
                ]);
            };

            // Attempt 1 with current settings
            response = await createOrderWithTimeout(orderRequest);
            console.log('✅ Cashfree Session Created:', response.data.payment_session_id);

        } catch (cfError) {
            const errorMsg = cfError.response?.data?.message || cfError.message;
            console.error('❌ Costfree Init Failed:', errorMsg);

            // Mark DB as failed so we don't have infinite pending orders
            newPurchase.paymentStatus = 'failed';
            newPurchase.registrationError = errorMsg;
            await newPurchase.save();

            return res.status(502).json({
                success: false,
                message: `Payment Gateway Error: ${errorMsg}`, // Expose real error to user
                error: errorMsg
            });
        }

        // ---------------------------------------------------------
        // 4. UPDATE DB: Attach Session ID
        // ---------------------------------------------------------
        newPurchase.paymentSessionId = response.data.payment_session_id;
        await newPurchase.save();

        res.json({
            success: true,
            data: {
                order_id: orderId,
                payment_session_id: response.data.payment_session_id,
                order_status: response.data.order_status,
                amount: totalAmount,
                currency: "INR",
                environment: isUsingProd ? 'production' : 'sandbox'
            }
        });

    } catch (error) {
        console.error('Global Create Order Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server Error',
            error: error.message
        });
    }
});

// QR code generation is now handled by the unified qrCodeService.js
// generateQRCode is removed to avoid inconsistency with the admin scanner.

// Step 1: Create Payment Order (Following official documentation with fallback)
router.get('/verify/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log('Verifying order:', orderId);

        // Check DB first for Mock/Fallback orders
        // Check DB first for Mock/Fallback orders
        const purchase = await Purchase.findOne({ orderId });
        if (purchase && purchase.fallbackUsed) {
            console.log('⚠️ Fallback Order Verified Locally:', orderId);

            // Update status if needed (though success endpoint handles it too)
            if (purchase.paymentStatus !== 'completed') {
                purchase.paymentStatus = 'completed';
                await purchase.save();
            }

            return res.json({
                success: true,
                data: [{
                    payment_status: 'SUCCESS',
                    order_status: 'PAID',
                    order_id: orderId
                }]
            });
        }

        let response;
        // MOCK MODE: If order ID indicates mock/test or credentials are dummy
        // MOCK MODE: If order ID indicates mock/test or credentials are dummy
        if (process.env.CASHFREE_APP_ID === 'dummy_app_id') {
            return res.status(400).json({
                success: false,
                message: 'Mock Mode disabled. Please configure valid credentials.'
            });
        } else {
            try {
                // Try with current environment
                response = await cashfree.PGOrderFetchPayments(orderId);
                console.log('Order verification response:', response.data);
            } catch (error) {
                // If failed and not using prod, try with prod credentials
                if (!isUsingProd && process.env.CASHFREE_APP_ID) {
                    console.log('🔄 Verification fallback to PRODUCTION...');
                    initializeCashfree(true);
                    response = await cashfree.PGOrderFetchPayments(orderId);
                    console.log('Order verification response (fallback):', response.data);
                } else {
                    throw error;
                }
            }
        }

        res.json({
            success: true,
            data: response.data,
            environment: isUsingProd ? 'production' : 'sandbox'
        });

    } catch (error) {
        console.error('Order verification error:', error);

        if (error.response && error.response.data) {
            console.error('Cashfree error:', error.response.data);
            return res.status(400).json({
                success: false,
                message: error.response.data.message || 'Order verification failed',
                error: error.response.data
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error during order verification',
            error: error.message
        });
    }
});

// Alternative verification endpoint
router.post('/verify', async (req, res) => {
    try {
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        let response;
        try {
            response = await cashfree.PGOrderFetchPayments(orderId);
        } catch (error) {
            if (!isUsingProd && process.env.CASHFREE_APP_ID) {
                console.log('🔄 Verification fallback to PRODUCTION...');
                initializeCashfree(true);
                response = await cashfree.PGOrderFetchPayments(orderId);
            } else {
                throw error;
            }
        }

        res.json({
            success: true,
            data: response.data,
            environment: isUsingProd ? 'production' : 'sandbox'
        });

    } catch (error) {
        console.error('Order verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification failed',
            error: error.message
        });
    }
});

// Get order status (Step 3: Confirming Payment with fallback)
router.get('/status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log('Checking payment status for order:', orderId);

        let response;
        try {
            // Try with current environment first
            response = await cashfree.PGFetchOrder(orderId);
            console.log('Cashfree order status response:', response.data);
        } catch (error) {
            // If failed and not using prod, try with prod credentials
            if (!isUsingProd && process.env.CASHFREE_APP_ID) {
                console.log('🔄 Status check fallback to PRODUCTION...');
                initializeCashfree(true);
                response = await cashfree.PGFetchOrder(orderId);
                console.log('Cashfree order status response (fallback):', response.data);
            } else {
                throw error;
            }
        }

        res.json({
            success: true,
            data: {
                orderId: orderId,
                paymentStatus: response.data.order_status === 'PAID' ? 'completed' : 'pending',
                totalAmount: response.data.order_amount,
                items: [{ itemName: `Order ${orderId}`, price: response.data.order_amount }],
                userRegistered: true,
                qrGenerated: true,
                emailSent: true,
                environment: isUsingProd ? 'production' : 'sandbox'
            }
        });

    } catch (error) {
        console.error('Get order status error:', error);

        if (error.response && error.response.data) {
            console.error('Cashfree error:', error.response.data);
            return res.status(400).json({
                success: false,
                message: error.response.data.message || 'Failed to fetch order status',
                error: error.response.data
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Payment success handler - processes completed payments and sends emails
// Called by frontend after Cashfree redirects to /payment/success
router.get('/success/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log('🎉 GET /success/:orderId called for order:', orderId);

        // ─── RETRY LOOP ──────────────────────────────────────────────
        // Cashfree can return 'pending' for a few seconds right after payment.
        // We poll up to 10 times with 2-second gaps before giving up.
        // ─────────────────────────────────────────────────────────────
        const MAX_RETRIES = 10;
        const RETRY_DELAY_MS = 2000;
        let paymentStatus = 'pending';

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await cashfree.PGOrderFetchPayments(orderId);
                const payments = response.data;
                if (payments && payments.length > 0) {
                    const latestPayment = payments[payments.length - 1];
                    paymentStatus = latestPayment.payment_status;
                    console.log(`🔍 Attempt ${attempt}/${MAX_RETRIES} — Cashfree status: ${paymentStatus}`);
                } else {
                    console.log(`⚠️ Attempt ${attempt}/${MAX_RETRIES} — No payment data yet`);
                }
            } catch (err) {
                console.error(`❌ Attempt ${attempt}/${MAX_RETRIES} — Cashfree call failed:`, err.message);
            }

            if (paymentStatus === 'SUCCESS') break; // Got what we need

            if (attempt < MAX_RETRIES) {
                console.log(`⏳ Waiting ${RETRY_DELAY_MS}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }

        // After retries — process ONLY if SUCCESS
        if (paymentStatus === 'SUCCESS') {
            console.log('✅ Payment confirmed SUCCESS — processing now');

            // Try to get the latest transaction details to pass to processPaymentSuccess
            let paymentData = null;
            try {
                const response = await cashfree.PGOrderFetchPayments(orderId);
                const payments = response.data;
                if (payments && payments.length > 0) {
                    const latest = payments[payments.length - 1];
                    paymentData = {
                        transactionId: latest.cf_payment_id,
                        paymentMethod: latest.payment_method
                    };
                }
            } catch (err) {
                console.warn('⚠️ Could not fetch transaction details for success page, but payment is SUCCESS:', err.message);
            }

            const result = await processPaymentSuccess(orderId, paymentData);

            if (result.success) {
                return res.json({
                    success: true,
                    message: result.alreadyProcessed ? 'Payment already processed' : 'Payment processed successfully',
                    user: result.user ? { id: result.user._id, name: result.user.name, email: result.user.email } : undefined,
                    purchase: result.purchase ? { orderId: result.purchase.orderId, status: result.purchase.paymentStatus } : undefined
                });
            } else {
                return res.status(404).json({ success: false, message: result.message });
            }
        } else {
            console.log(`❌ Payment status "${paymentStatus}" — not processing success`);
            return res.status(400).json({
                success: false,
                message: `Payment not confirmed. Status: ${paymentStatus}. If money was deducted, it will be updated soon via webhook.`
            });
        }

    } catch (error) {
        console.error('❌ Payment success processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});


// ----------------------------------------------------------------------
// WEBHOOK HANDLER
// ----------------------------------------------------------------------
router.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;
        console.log('🔔 Webhook Received:', JSON.stringify(payload, null, 2));

        // Basic validation (In production, verify x-webhook-signature)
        if (!payload || !payload.data) {
            return res.status(400).json({ status: 'Invalid Payload' });
        }

        const type = payload.type;
        const data = payload.data;

        if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
            const orderId = data.order.order_id;
            const status = data.payment.payment_status;

            console.log(`✅ Webhook: Payment Success for ${orderId}`);

            if (status === 'SUCCESS') {
                // Store transaction metadata first
                const purchase = await Purchase.findOne({ orderId: orderId });
                if (purchase && purchase.paymentStatus !== 'completed') {
                    purchase.transactionId = data.payment.cf_payment_id;
                    purchase.paymentMethod = data.payment.payment_method;
                    await purchase.save();
                }

                // ✅ Trigger full processing (QR generation + email) via shared helper
                try {
                    console.log(`🔄 Webhook: triggering processPaymentSuccess for ${orderId}`);
                    const paymentData = {
                        transactionId: data.payment.cf_payment_id,
                        paymentMethod: data.payment.payment_method
                    };
                    const result = await processPaymentSuccess(orderId, paymentData);
                    if (result.success) {
                        console.log(`✅ Webhook: processPaymentSuccess completed for ${orderId}`);
                    } else {
                        console.error(`❌ Webhook: processPaymentSuccess failed for ${orderId}:`, result.message);
                    }
                } catch (processError) {
                    console.error(`❌ Webhook: Error in processPaymentSuccess for ${orderId}:`, processError);
                }
            }
        }
        else if (type === 'PAYMENT_FAILED_WEBHOOK') {
            const orderId = data.order.order_id;
            console.log(`❌ Webhook: Payment Failed for ${orderId}`);

            const purchase = await Purchase.findOne({ orderId: orderId });
            if (purchase) {
                purchase.paymentStatus = 'failed';
                purchase.registrationError = data.error_details?.error_description || 'Payment Failed';
                await purchase.save();
            }
        }

        res.status(200).json({ status: 'OK' });

    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({ status: 'Error', message: error.message });
    }
});

module.exports = {
    router,
    processPaymentSuccess
};
