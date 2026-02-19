const express = require('express');
const crypto = require('crypto');
const { Cashfree, CFEnvironment } = require('cashfree-pg');
const { User, Purchase, TeamComposition, Event } = require('../models/models');
const { sendRegistrationEmail } = require('../utils/emailService');
const { generateUserQRCode } = require('../utils/qrCodeService');
const qr = require('qr-image');
const fs = require('fs');
const path = require('path');
const router = express.Router();

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
            const eventName = item.title || item.itemName || item.name;
            const category = item.category;

            if (!eventName) {
                console.warn('⚠️ Item missing name/title:', item);
                continue;
            }

            // Smart Lookup: Try specific variant first, then generic
            let event = null;
            let lookupName = eventName;

            // 1. Try "Event Name (Category)" e.g., "Football (Boys)"
            if (category && category !== 'Open') {
                const catFormatted = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
                const specificName = `${eventName} (${catFormatted})`;

                event = await Event.findOne({ name: specificName });
                if (event) {
                    lookupName = specificName;
                }
            }

            // 2. Fallback to generic "Event Name"
            if (!event) {
                event = await Event.findOne({ name: eventName });
            }

            if (!event) {
                console.error(`❌ Event not found in DB: "${eventName}" (checked variant: "${lookupName}")`);
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
                price: realPrice, // Enforce DB price
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
                ip: req.ip,
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
                        setTimeout(() => reject(new Error('Cashfree API timeout')), 10000)
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
            message: 'Server Error',
            error: error.message
        });
    }
});

// Generate QR code for user using MongoDB ObjectID
async function generateQRCode(purchaseId, userData) {
    try {
        const qrDir = path.join(__dirname, '../app/qrcode');
        if (!fs.existsSync(qrDir)) {
            fs.mkdirSync(qrDir, { recursive: true });
        }

        const qrData = JSON.stringify({
            id: purchaseId,
            name: userData.name,
            email: userData.email,
            orderId: userData.orderId,
            timestamp: Date.now()
        });

        const qrFilename = `${purchaseId}.png`;
        const qrPath = path.join(qrDir, qrFilename);
        const qrRelativePath = `/app/qrcode/${qrFilename}`;

        return new Promise((resolve, reject) => {
            const qrPng = qr.image(qrData, { type: 'png', size: 10 });
            const writeStream = fs.createWriteStream(qrPath);
            const chunks = [];

            // Collect data for base64 conversion
            qrPng.on('data', (chunk) => {
                chunks.push(chunk);
            });

            qrPng.on('end', () => {
                const qrBuffer = Buffer.concat(chunks);
                const qrBase64 = qrBuffer.toString('base64');
                console.log(`✅ QR code generated: ${qrRelativePath}`);
                resolve({
                    qrPath: qrRelativePath,
                    qrFilePath: qrPath,
                    qrBase64: qrBase64
                });
            });

            qrPng.pipe(writeStream);

            writeStream.on('error', (error) => {
                console.error('❌ QR code generation failed:', error);
                reject(error);
            });
        });
    } catch (error) {
        console.error('❌ QR code generation error:', error);
        throw error;
    }
}

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
router.get('/success/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log('🎉 Processing payment success for order:', orderId);

        // Find the purchase record
        const purchase = await Purchase.findOne({ orderId: orderId });
        if (!purchase) {
            console.error('❌ Purchase not found for orderId:', orderId);
            return res.status(404).json({
                success: false,
                message: 'Purchase not found'
            });
        }

        // Check if payment is already processed
        if (purchase.paymentStatus === 'completed') {
            console.log('✅ Payment already processed for order:', orderId);
            return res.json({
                success: true,
                message: 'Payment already processed',
                purchase: purchase
            });
        }

        // Verify payment status with Cashfree
        let paymentStatus;
        try {
            const response = await cashfree.PGOrderFetchPayments(orderId);
            const payments = response.data;

            if (payments && payments.length > 0) {
                const latestPayment = payments[payments.length - 1];
                paymentStatus = latestPayment.payment_status;
                console.log('🔍 Payment status from Cashfree:', paymentStatus);
            } else {
                console.log('⚠️ No payment data found for order:', orderId);
                paymentStatus = 'pending';
            }
        } catch (error) {
            console.error('❌ Error verifying payment status:', error);
            paymentStatus = 'pending';
        }

        if (paymentStatus === 'SUCCESS') {
            console.log('✅ Payment confirmed as successful for order:', orderId);

            // Update purchase status to completed
            purchase.paymentStatus = 'completed';
            purchase.paymentCompletedAt = new Date();

            // Generate QR codes for ALL users associated with this purchase
            console.log('🔄 Starting QR code generation for all users in this purchase...');

            // Step 1: Generate QR code for main person (team leader)
            let user = await User.findOne({ email: purchase.userDetails.email });

            // Extract event names from purchase items
            const eventNames = purchase.items.map(item => item.itemName).filter(name => name && name !== 'Demo Payment');
            console.log('📝 Extracted event names from purchase:', eventNames);

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
                    events: eventNames.length > 0 ? eventNames : ['General Registration'],
                    isvalidated: true
                });
            } else {
                // Update existing user profile with new details if they are missing or if this is a new registration
                if (purchase.userDetails.contactNo) user.contactNo = purchase.userDetails.contactNo;
                if (purchase.userDetails.gender) user.gender = purchase.userDetails.gender;
                if (purchase.userDetails.age) user.age = purchase.userDetails.age;
                if (purchase.userDetails.universityName) user.universityName = purchase.userDetails.universityName;
                if (purchase.userDetails.address) user.address = purchase.userDetails.address;
                if (purchase.userDetails.formData?.universityIdCard) user.universityIdCard = purchase.userDetails.formData.universityIdCard;

                // Update existing user with new events
                if (eventNames.length > 0) {
                    // Add new events to existing events array (avoid duplicates)
                    const currentEvents = user.events || [];
                    const newEvents = eventNames.filter(event => !currentEvents.includes(event));
                    if (newEvents.length > 0) {
                        user.events = [...currentEvents, ...newEvents];
                        console.log('✅ Added new events to existing user:', newEvents);
                    }
                } else if (!user.events || user.events.length === 0) {
                    user.events = ['General Registration'];
                    console.log('⚠️ No valid events found, setting to General Registration');
                }
            }

            // Generate QR code for main person only if not already generated
            if (!user.qrCodeBase64) {
                try {
                    const qrCodeBase64 = await generateUserQRCode(user._id, {
                        name: user.name,
                        email: user.email,
                        events: user.events || []
                    });
                    user.qrPath = `${user._id}`;
                    user.qrCodeBase64 = qrCodeBase64;
                    console.log('✅ QR code generated for main person:', user._id);
                } catch (qrError) {
                    console.error('❌ QR code generation failed for main person:', qrError);
                }
            } else {
                console.log('ℹ️ QR code already exists for main person:', user._id);
            }

            await user.save();

            // Update purchase with user ID and QR info
            purchase.userId = user._id;
            purchase.qrGenerated = true;
            purchase.qrCodeBase64 = user.qrCodeBase64;

            // Save purchase with all updates
            await purchase.save();
            console.log('✅ Purchase status updated to completed for order:', orderId);

            // ==========================================
            // TEAM REGISTRATION PROCESSING
            // ==========================================
            if (purchase.userDetails.teamMembers && Object.keys(purchase.userDetails.teamMembers).length > 0) {
                console.log('👥 Processing Team Registrations...');
                const teamData = purchase.userDetails.teamMembers;

                for (const [eventId, members] of Object.entries(teamData)) {
                    // Find the event name from items (or map ID to name if we have a lookup)
                    // We stored processedItems with itemId matching eventId usually, or we can use the key if it's the name
                    // But in frontend we used IDs like 'cricket-leather'.
                    // Let's try to find a matching item in purchase.items to get the proper name
                    const matchedItem = purchase.items.find(i => i.itemId === eventId || i.itemId === eventId.replace(/-/g, ' '));
                    const eventName = matchedItem ? matchedItem.itemName : eventId; // Fallback to ID if name not found

                    console.log(`   🏆 Creating Team for: ${eventName}`);

                    // Create TeamComposition
                    const newTeam = new TeamComposition({
                        eventName: eventName,
                        teamName: `${user.name}'s Team`, // Default name, could be captured in frontend
                        teamLeader: {
                            userId: user._id,
                            name: user.name,
                            email: user.email,
                            hasEntered: false
                        },
                        teamMembers: members.map(m => ({
                            userId: user._id, // Ideally we should create User records for them too, but for now linking to Leader or placeholder
                            // Wait, if we link to user._id, it means they are all the same user? No.
                            // We should probably create 'Ghost Users' or just store their details embedded.
                            // The schema expects 'userId' which is ObjectId ref 'User'.
                            // If we don't have users for them, we might need to create them or make userId optional in schema?
                            // Looking at schema: userId is required.
                            // So we MUST create users for them? Or maybe just use the leader's ID for now?
                            // Let's create new Unverified Users for them to be safe and correct.
                            name: m.name,
                            email: m.email,
                            // We don't have IDs yet.
                        })),
                        totalMembers: members.length + 1, // +1 for Leader
                        purchaseId: purchase._id
                    });

                    // We need valid User IDs for members.
                    // Async Loop to find/create users for members
                    const memberObjects = [];
                    for (const m of members) {
                        let memberUser = await User.findOne({ email: m.email });
                        if (!memberUser) {
                            memberUser = new User({
                                name: m.name,
                                email: m.email,
                                contactNo: m.phone || '',
                                events: [eventName],
                                isvalidated: false
                            });
                            await memberUser.save();
                            console.log(`      ✨ Created new user for member: ${m.email}`);
                        } else {
                            // Update existing user events
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

                    newTeam.teamMembers = memberObjects;
                    await newTeam.save();
                    console.log(`      ✅ TeamComposition created: ${newTeam._id}`);

                    // Link to Leader's teamRegistrations
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

            // Step 3: Final check - Generate QR codes for any remaining users without QR codes
            console.log('🔍 Final check: Generating QR codes for any users without them...');
            try {
                // Find all users associated with this purchase who don't have QR codes
                const usersWithoutQR = await User.find({
                    $or: [
                        { email: purchase.userDetails.email },
                        { email: { $in: (purchase.userDetails.teamMembers || []).map(tm => tm.email) } }
                    ],
                    qrCodeBase64: { $exists: false }
                });

                for (const userWithoutQR of usersWithoutQR) {
                    try {
                        console.log(`🎫 Generating missing QR code for user: ${userWithoutQR.email}`);

                        const qrCodeBase64 = await generateUserQRCode(userWithoutQR._id, {
                            name: userWithoutQR.name,
                            email: userWithoutQR.email,
                            events: userWithoutQR.events || []
                        });

                        userWithoutQR.qrPath = `${userWithoutQR._id}`;
                        userWithoutQR.qrCodeBase64 = qrCodeBase64;
                        await userWithoutQR.save();

                        console.log(`✅ Missing QR code generated for user: ${userWithoutQR._id} (${userWithoutQR.email})`);
                    } catch (qrError) {
                        console.error(`❌ Failed to generate missing QR code for ${userWithoutQR.email}:`, qrError);
                    }
                }

                console.log(`🎯 QR code generation complete. Processed ${usersWithoutQR.length} users without QR codes.`);
            } catch (finalQrError) {
                console.error('❌ Error in final QR code generation step:', finalQrError);
            }

            // Update team compositions for this user (if any)
            let teamMembers = [];
            try {
                console.log('🏆 Checking for team compositions to update for email:', user.email);

                // Find team compositions where this user is either team leader or team member
                const teamCompositions = await TeamComposition.find({
                    $or: [
                        { 'teamLeader.email': user.email },
                        { 'teamMembers.email': user.email }
                    ],
                    paymentStatus: 'pending'
                }).populate('teamMembers.userId', 'name email contactNo');

                if (teamCompositions.length > 0) {
                    console.log(`🎯 Found ${teamCompositions.length} team compositions to update`);

                    // Extract team members for purchase record
                    const allTeamMembers = new Set();

                    for (const teamComp of teamCompositions) {
                        teamComp.paymentStatus = 'completed';
                        teamComp.purchaseId = purchase._id;
                        teamComp.updatedAt = new Date();

                        // Step 2: Generate QR codes for ALL team members
                        console.log(`🔄 Generating QR codes for team members in ${teamComp.teamName}...`);

                        for (const member of teamComp.teamMembers) {
                            if (member.userId && member.userId.email !== user.email) {
                                try {
                                    // Find the team member user record
                                    const memberUser = await User.findById(member.userId._id);
                                    if (memberUser && !memberUser.qrCodeBase64) {
                                        console.log(`🎫 Generating QR code for team member: ${memberUser.email}`);

                                        const memberQrCodeBase64 = await generateUserQRCode(memberUser._id, {
                                            name: memberUser.name,
                                            email: memberUser.email,
                                            events: memberUser.events || []
                                        });

                                        memberUser.qrPath = `${memberUser._id}`;
                                        memberUser.qrCodeBase64 = memberQrCodeBase64;
                                        await memberUser.save();

                                        console.log(`✅ QR code generated for team member: ${memberUser._id} (${memberUser.email})`);
                                    } else if (memberUser && memberUser.qrCodeBase64) {
                                        console.log(`ℹ️ QR code already exists for team member: ${memberUser.email}`);
                                    }
                                } catch (memberQrError) {
                                    console.error(`❌ QR code generation failed for team member ${member.email}:`, memberQrError);
                                }

                                // Collect team members for purchase record
                                allTeamMembers.add(JSON.stringify({
                                    name: member.userId.name,
                                    email: member.userId.email,
                                    contactNo: member.userId.contactNo || ''
                                }));
                            }
                        }

                        await teamComp.save();
                        console.log(`✅ Updated team composition: ${teamComp.teamName} (${teamComp.eventName})`);
                    }

                    // Convert Set back to array of objects
                    teamMembers = Array.from(allTeamMembers).map(memberStr => JSON.parse(memberStr));

                    // Update purchase with team information
                    purchase.userDetails.teamMembers = teamMembers;
                    purchase.mainPersonId = user._id; // Set main person as team leader
                    console.log(`🎯 Added ${teamMembers.length} team members to purchase record`);

                } else {
                    console.log('ℹ️ No pending team compositions found for this user');
                }
            } catch (teamError) {
                console.error('❌ Error updating team compositions:', teamError);
            }

            // Save purchase with team member updates
            await purchase.save();
            console.log('💾 Purchase saved with team member data');

            // Send registration email to team leader and all team members
            try {
                const emailData = {
                    name: user.name,
                    email: user.email,
                    events: user.events || ['General Registration'],
                    qrCodeBase64: user.qrCodeBase64
                };

                // Send email to team leader (main person)
                const emailResult = await sendRegistrationEmail(user.email, emailData);
                if (emailResult.success) {
                    console.log('✅ Registration email sent successfully to team leader:', user.email);
                    user.emailSent = true;
                    user.emailSentAt = new Date();
                    await user.save();
                } else {
                    console.error('❌ Failed to send registration email to team leader:', emailResult.error);
                }

                // Send emails to all team members
                if (teamMembers && teamMembers.length > 0) {
                    console.log(`📧 Sending emails to ${teamMembers.length} team members...`);

                    for (const teamMember of teamMembers) {
                        try {
                            // Find the team member's user record to get their QR code
                            const memberUser = await User.findOne({ email: teamMember.email });
                            if (memberUser) {
                                const memberEmailData = {
                                    name: memberUser.name,
                                    email: memberUser.email,
                                    events: memberUser.events || eventNames || ['General Registration'],
                                    qrCodeBase64: memberUser.qrCodeBase64
                                };

                                const memberEmailResult = await sendRegistrationEmail(memberUser.email, memberEmailData);
                                if (memberEmailResult.success) {
                                    console.log('✅ Registration email sent successfully to team member:', memberUser.email);
                                    memberUser.emailSent = true;
                                    memberUser.emailSentAt = new Date();
                                    await memberUser.save();
                                } else {
                                    console.error('❌ Failed to send registration email to team member:', memberUser.email, memberEmailResult.error);
                                }
                            } else {
                                console.warn('⚠️ Team member user not found for email:', teamMember.email);
                            }
                        } catch (memberEmailError) {
                            console.error('❌ Error sending email to team member:', teamMember.email, memberEmailError);
                        }
                    }
                }

                // Also send emails to support staff if any
                try {
                    const supportStaff = await User.find({
                        userType: 'support_staff',
                        events: { $in: user.events || [] },
                        emailSent: false
                    });

                    if (supportStaff.length > 0) {
                        console.log(`📧 Sending emails to ${supportStaff.length} support staff members...`);

                        for (const supportUser of supportStaff) {
                            const supportEmailData = {
                                name: supportUser.name,
                                email: supportUser.email,
                                events: supportUser.events,
                                qrCodeBase64: supportUser.qrCodeBase64,
                                supportRole: supportUser.supportRole
                            };

                            const supportEmailResult = await sendRegistrationEmail(supportUser.email, supportEmailData);
                            if (supportEmailResult.success) {
                                console.log('✅ Registration email sent successfully to support staff:', supportUser.email);
                                supportUser.emailSent = true;
                                supportUser.emailSentAt = new Date();
                                await supportUser.save();
                            } else {
                                console.error('❌ Failed to send registration email to support staff:', supportUser.email, supportEmailResult.error);
                            }
                        }
                    }
                } catch (supportEmailError) {
                    console.error('❌ Error sending emails to support staff:', supportEmailError);
                }
            } catch (emailError) {
                console.error('❌ Email sending error:', emailError);
            }

            res.json({
                success: true,
                message: 'Payment processed successfully',
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email
                },
                purchase: {
                    orderId: purchase.orderId,
                    status: purchase.paymentStatus
                }
            });
        } else {
            console.log('⏳ Payment still pending for order:', orderId);

            // Update purchase status to pending if not successful
            purchase.paymentStatus = 'pending';
            await purchase.save();

            res.json({
                success: true,
                message: 'Payment is still pending',
                status: 'pending'
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
                const purchase = await Purchase.findOne({ orderId: orderId });

                if (purchase) {
                    if (purchase.paymentStatus !== 'completed') {
                        purchase.paymentStatus = 'completed';
                        purchase.paymentCompletedAt = new Date();
                        purchase.transactionId = data.payment.cf_payment_id;
                        purchase.paymentMethod = data.payment.payment_method;

                        // NOTE: QR Code generation is typically triggered by user visiting /success
                        // But we can mark it as paid here to be safe.

                        await purchase.save();
                        console.log(`💾 DB Updated via Webhook: ${orderId} -> Completed`);
                    } else {
                        console.log(`ℹ️ Order ${orderId} already marked as completed.`);
                    }
                } else {
                    console.error(`❌ Webhook Error: Purchase not found for ${orderId}`);
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

module.exports = router;
