require('dotenv').config();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { User, Purchase, TeamComposition } = require('./models/models');

async function exportPaidUsers() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.mongodb);
        console.log('Connected!');

        // Fetch all completed purchases
        const completedPurchases = await Purchase.find({ paymentStatus: 'completed' })
            .sort({ purchaseDate: -1 })
            .lean();

        console.log(`Total completed purchases: ${completedPurchases.length}`);

        // Fetch all team compositions for team info
        const teams = await TeamComposition.find({}).lean();
        const teamMap = {};
        for (const team of teams) {
            const leaderId = team.teamLeader?.userId?.toString();
            if (leaderId) {
                if (!teamMap[leaderId]) teamMap[leaderId] = [];
                teamMap[leaderId].push({ role: 'Leader', teamName: team.teamName, eventName: team.eventName });
            }
            for (const member of team.teamMembers || []) {
                const memberId = member.userId?.toString();
                if (memberId) {
                    if (!teamMap[memberId]) teamMap[memberId] = [];
                    teamMap[memberId].push({ role: 'Member', teamName: team.teamName, eventName: team.eventName });
                }
            }
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Spardha';
        workbook.created = new Date();

        // --- Sheet 1: Paid Users (one row per user) ---
        const sheet1 = workbook.addWorksheet('Paid Users');
        sheet1.columns = [
            { header: 'S.No', key: 'sno', width: 6 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Contact No', key: 'contactNo', width: 16 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'Age', key: 'age', width: 6 },
            { header: 'University', key: 'universityName', width: 30 },
            { header: 'Address', key: 'address', width: 50 },
            { header: 'University ID Card', key: 'universityIdCard', width: 20 },
            { header: 'Referral Code', key: 'referralCode', width: 15 },
            { header: 'My Referral Code', key: 'referalID', width: 18 },
            { header: 'Referral Count', key: 'referalcount', width: 14 },
            { header: 'Events Registered', key: 'events', width: 60 },
            { header: 'Team Participations', key: 'teams', width: 50 },
            { header: 'Order ID', key: 'orderId', width: 28 },
            { header: 'Amount Paid (₹)', key: 'totalAmount', width: 16 },
            { header: 'Transaction ID', key: 'transactionId', width: 25 },
            { header: 'Payment Date', key: 'paymentDate', width: 22 },
            { header: 'Email Verified', key: 'isvalidated', width: 14 },
            { header: 'Email Sent', key: 'emailSent', width: 12 },
            { header: 'Has Entered', key: 'hasEntered', width: 12 },
            { header: 'Entry Time', key: 'entryTime', width: 20 },
            { header: 'Registered At', key: 'createdAt', width: 20 },
        ];

        // Style header
        sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
        sheet1.getRow(1).alignment = { horizontal: 'center' };
        sheet1.views = [{ state: 'frozen', ySplit: 1 }];
        sheet1.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: sheet1.columns.length }
        };

        // Collect unique paid user emails from completed purchases
        const paidUserEmails = new Set();
        const purchaseByEmail = {};

        for (const p of completedPurchases) {
            const email = p.userDetails?.email?.toLowerCase()?.trim();
            if (email) {
                paidUserEmails.add(email);
                // Keep the first (most recent since sorted desc) completed purchase per email
                if (!purchaseByEmail[email]) {
                    purchaseByEmail[email] = p;
                }
            }
        }

        // Fetch all users who have a completed payment
        const paidUsers = await User.find({
            email: { $in: Array.from(paidUserEmails) }
        }).lean();

        console.log(`Total paid users found in User collection: ${paidUsers.length}`);

        // Also collect users from purchases that may not be in User collection
        const usersByEmail = {};
        for (const u of paidUsers) {
            usersByEmail[u.email.toLowerCase().trim()] = u;
        }

        let sno = 1;
        for (const email of paidUserEmails) {
            const user = usersByEmail[email];
            const purchase = purchaseByEmail[email];

            // Gather all purchases for this email to list all events
            const allUserPurchases = completedPurchases.filter(
                p => p.userDetails?.email?.toLowerCase()?.trim() === email
            );
            const allEvents = [];
            for (const p of allUserPurchases) {
                for (const item of (p.items || [])) {
                    if (item.itemName && !allEvents.includes(item.itemName)) {
                        allEvents.push(item.itemName);
                    }
                }
            }

            // Also include events from the User record
            if (user?.events) {
                for (const ev of user.events) {
                    if (!allEvents.includes(ev)) {
                        allEvents.push(ev);
                    }
                }
            }

            // Total amount across all purchases
            const totalPaid = allUserPurchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

            // Team info
            const userId = user?._id?.toString();
            const userTeams = userId ? (teamMap[userId] || []) : [];
            const teamNames = userTeams.map(t => `${t.eventName}: ${t.teamName} (${t.role})`).join(', ');

            // Transaction IDs from all purchases
            const allTransactionIds = allUserPurchases
                .map(p => p.transactionId || p.paymentSessionId || '')
                .filter(Boolean)
                .join(', ');

            // Order IDs from all purchases
            const allOrderIds = allUserPurchases
                .map(p => p.orderId || '')
                .filter(Boolean)
                .join(', ');

            sheet1.addRow({
                sno: sno++,
                name: user?.name || purchase.userDetails?.name || '',
                email: email,
                contactNo: user?.contactNo || purchase.userDetails?.contactNo || '',
                gender: user?.gender || purchase.userDetails?.gender || '',
                age: user?.age || purchase.userDetails?.age || '',
                universityName: user?.universityName || purchase.userDetails?.universityName || '',
                address: user?.address || purchase.userDetails?.address || '',
                universityIdCard: user?.universityIdCard || purchase.userDetails?.formData?.universityIdCard || purchase.userDetails?.universityIdCard || '',
                referralCode: user?.referralCode || purchase.userDetails?.formData?.referralCode || purchase.userDetails?.referralCode || '',
                referalID: user?.referalID || '',
                referalcount: user?.referalcount || 0,
                events: allEvents.join(', '),
                teams: teamNames,
                orderId: allOrderIds,
                totalAmount: totalPaid,
                transactionId: allTransactionIds,
                paymentDate: purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleString('en-IN') : '',
                isvalidated: user?.isvalidated ? 'Yes' : 'No',
                emailSent: user?.emailSent ? 'Yes' : 'No',
                hasEntered: user?.hasEntered ? 'Yes' : 'No',
                entryTime: user?.entryTime ? new Date(user.entryTime).toLocaleString('en-IN') : '',
                createdAt: user?.createdAt ? new Date(user.createdAt).toLocaleString('en-IN') : '',
            });
        }

        // --- Sheet 2: All Payments Detail (one row per purchase) ---
        const sheet2 = workbook.addWorksheet('All Payment Transactions');
        sheet2.columns = [
            { header: 'S.No', key: 'sno', width: 6 },
            { header: 'Order ID', key: 'orderId', width: 28 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Contact No', key: 'contactNo', width: 16 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'Age', key: 'age', width: 6 },
            { header: 'University', key: 'universityName', width: 30 },
            { header: 'Address', key: 'address', width: 50 },
            { header: 'University ID Card', key: 'universityIdCard', width: 20 },
            { header: 'Referral Code', key: 'referralCode', width: 15 },
            { header: 'Events', key: 'events', width: 60 },
            { header: 'Team Members', key: 'teamMembers', width: 60 },
            { header: 'Amount (₹)', key: 'amount', width: 12 },
            { header: 'Payment Status', key: 'paymentStatus', width: 16 },
            { header: 'Transaction ID', key: 'transactionId', width: 25 },
            { header: 'Payment Method', key: 'paymentMethod', width: 18 },
            { header: 'User Registered', key: 'userRegistered', width: 16 },
            { header: 'QR Generated', key: 'qrGenerated', width: 14 },
            { header: 'Email Sent', key: 'emailSent', width: 12 },
            { header: 'Payment Date', key: 'paymentDate', width: 22 },
            { header: 'Payment Completed At', key: 'paymentCompletedAt', width: 22 },
        ];

        sheet2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFED7D31' } };
        sheet2.getRow(1).alignment = { horizontal: 'center' };
        sheet2.views = [{ state: 'frozen', ySplit: 1 }];
        sheet2.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: sheet2.columns.length }
        };

        let sno2 = 1;
        for (const p of completedPurchases) {
            const eventsInPurchase = (p.items || []).map(i => i.itemName).filter(Boolean).join(', ');
            const teamMembersStr = (p.userDetails?.teamMembers || [])
                .map(tm => `${tm.name || ''} (${tm.email || ''})`)
                .filter(s => s !== ' ()')
                .join(', ');

            // Try to get extra details from User collection
            let userUniversityIdCard = p.userDetails?.formData?.universityIdCard || p.userDetails?.universityIdCard || '';
            let userReferral = p.userDetails?.formData?.referralCode || p.userDetails?.referralCode || '';

            if (!userUniversityIdCard || !userReferral) {
                const user = await User.findOne({ email: p.userDetails?.email }).lean();
                if (user) {
                    if (!userUniversityIdCard) userUniversityIdCard = user.universityIdCard || '';
                    if (!userReferral) userReferral = user.referralCode || '';
                }
            }

            sheet2.addRow({
                sno: sno2++,
                orderId: p.orderId || '',
                name: p.userDetails?.name || '',
                email: p.userDetails?.email || '',
                contactNo: p.userDetails?.contactNo || '',
                gender: p.userDetails?.gender || '',
                age: p.userDetails?.age || '',
                universityName: p.userDetails?.universityName || '',
                address: p.userDetails?.address || '',
                universityIdCard: userUniversityIdCard,
                referralCode: userReferral,
                events: eventsInPurchase,
                teamMembers: teamMembersStr,
                amount: p.totalAmount || 0,
                paymentStatus: p.paymentStatus || '',
                transactionId: p.transactionId || '',
                paymentMethod: p.paymentMethod || '',
                userRegistered: p.userRegistered ? 'Yes' : 'No',
                qrGenerated: p.qrGenerated ? 'Yes' : 'No',
                emailSent: p.emailSent ? 'Yes' : 'No',
                paymentDate: p.purchaseDate ? new Date(p.purchaseDate).toLocaleString('en-IN') : '',
                paymentCompletedAt: p.paymentCompletedAt ? new Date(p.paymentCompletedAt).toLocaleString('en-IN') : '',
            });
        }

        // Apply styling to all cells
        workbook.eachSheet((sheet) => {
            sheet.eachRow((row) => {
                row.eachCell({ includeEmpty: true }, (cell) => {
                    const currentHorizontal = cell.alignment?.horizontal || 'left';
                    cell.alignment = {
                        vertical: 'middle',
                        horizontal: currentHorizontal,
                        wrapText: true
                    };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                        bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                        right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
                    };
                });
            });
        });

        // Save file
        const outputDir = path.join(__dirname, 'public');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const outputPath = path.join(outputDir, 'paid_users_export.xlsx');
        await workbook.xlsx.writeFile(outputPath);

        console.log(`\n✅ Excel file saved to: ${outputPath}`);
        console.log(`📊 Summary:`);
        console.log(`   Unique paid users: ${paidUserEmails.size}`);
        console.log(`   Total completed transactions: ${completedPurchases.length}`);

        await mongoose.disconnect();
        console.log('Done!');
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

exportPaidUsers();
