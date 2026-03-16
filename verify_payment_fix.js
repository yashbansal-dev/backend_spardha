require('dotenv').config();
const mongoose = require('mongoose');
const { Purchase, User } = require('./models/models');
const { processPaymentSuccess } = require('./routes/cashfree_simple');

async function verifyFixes() {
    try {
        await mongoose.connect(process.env.mongodb);
        console.log('✅ Connected to DB');

        // 1. Find a template purchase
        const templatePurchase = await Purchase.findOne().lean();
        if (!templatePurchase) {
            console.error('❌ No purchases found in DB.');
            process.exit(1);
        }

        const testOrderId = `test_fix_${Date.now()}`;
        const testEmail = `test_fix_${Date.now()}@example.com`;

        // 2. Create a pending purchase
        const purchase = new Purchase({
            ...templatePurchase,
            _id: new mongoose.Types.ObjectId(),
            orderId: testOrderId,
            paymentStatus: 'pending',
            userDetails: {
                ...templatePurchase.userDetails,
                email: testEmail,
                name: 'Test Fix User'
            },
            transactionId: undefined,
            paymentMethod: undefined,
            emailSent: false,
            userRegistered: false
        });
        await purchase.save();
        console.log(`✅ Created test purchase: ${testOrderId}`);

        // 3. Test 1: First processing with payment data
        console.log('\n--- Test 1: First processing with payment data ---');
        const paymentData = {
            transactionId: 'TEST_TXN_123',
            paymentMethod: 'upi'
        };
        await processPaymentSuccess(testOrderId, paymentData);

        const updatedPurchase = await Purchase.findOne({ orderId: testOrderId });
        console.log('Status:', updatedPurchase.paymentStatus);
        console.log('Transaction ID:', updatedPurchase.transactionId);
        console.log('Payment Method:', updatedPurchase.paymentMethod);

        if (updatedPurchase.paymentStatus === 'completed' && updatedPurchase.transactionId === 'TEST_TXN_123') {
            console.log('✅ Test 1 Passed');
        } else {
            console.error('❌ Test 1 Failed');
        }

        // 4. Test 2: Idempotency and data backfilling
        console.log('\n--- Test 2: Idempotency and metadata backfilling ---');
        await Purchase.updateOne({ orderId: testOrderId }, { $set: { transactionId: 'OLD_ID' } });

        const paymentData2 = {
            transactionId: 'NEW_TXN_456',
            paymentMethod: 'card'
        };
        await processPaymentSuccess(testOrderId, paymentData2);

        const finalPurchase = await Purchase.findOne({ orderId: testOrderId });
        console.log('Status:', finalPurchase.paymentStatus);
        console.log('Transaction ID:', finalPurchase.transactionId);

        if (finalPurchase.transactionId === 'NEW_TXN_456') {
            console.log('✅ Test 2 Passed (Transaction ID backfilled)');
        } else {
            console.error('❌ Test 2 Failed');
        }

        // Test 3: Status check in GET /success (Manual check)
        console.log('\n--- Test 3: Status check logic (Info) ---');
        console.log('Note: GET /success/:orderId now explicitly returns 400 if status is not SUCCESS.');

        // Cleanup
        await Purchase.deleteOne({ orderId: testOrderId });
        await User.deleteOne({ email: testEmail });
        console.log('\n✅ Cleanup done');

    } catch (error) {
        console.error('❌ Verification Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

verifyFixes();
