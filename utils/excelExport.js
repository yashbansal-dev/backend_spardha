const ExcelJS = require('exceljs');
const { User, Purchase, TeamComposition } = require('../models/models');
const path = require('path');
const fs = require('fs');
const { analyzeCommitteeReferrals } = require('../analyze-committee-referrals');

async function generateExcelReport(outputPath) {
    try {
        console.log('Generating Excel report...');

        // Fetch all users
        const users = await User.find({}).lean();
        console.log(`Total users found: ${users.length}`);

        // Fetch all team compositions
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

        const maxEvents = users.reduce((max, u) => Math.max(max, (u.events || []).length), 0);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Spardha';
        workbook.created = new Date();

        // Fetch all purchases and index them by email for robust field lookup
        const allPurchases = await Purchase.find({}).sort({ purchaseDate: 1 }).lean();
        const purchaseMap = {};
        for (const p of allPurchases) {
            const email = p.userDetails?.email?.toLowerCase()?.trim();
            if (email) {
                // If multiple purchases, completed takes precedence, else latest one
                if (!purchaseMap[email] || (p.paymentStatus === 'completed' && purchaseMap[email].paymentStatus !== 'completed')) {
                    purchaseMap[email] = p;
                }
            }
        }

        // --- Sheet 1: All Registrants ---
        const sheet1 = workbook.addWorksheet('All Registrants');
        const baseColumns = [
            { header: 'S.No', key: 'sno', width: 6 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Contact No', key: 'contactNo', width: 16 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'Age', key: 'age', width: 6 },
            { header: 'University', key: 'universityName', width: 30 },
            { header: 'Address', key: 'address', width: 50 },
            { header: 'Referral Code', key: 'referralCode', width: 15 },
            { header: 'My Referal Code', key: 'referalID', width: 15 },
            { header: 'Referal Count', key: 'referalcount', width: 12 },
            { header: 'University ID Card', key: 'universityIdCard', width: 20 },
            { header: 'Payment Status', key: 'paymentStatus', width: 16 },
            { header: 'Total Amount (₹)', key: 'totalAmount', width: 16 },
            { header: 'Transaction ID', key: 'transactionId', width: 25 },
            { header: 'Team Participations', key: 'teams', width: 50 },
        ];

        for (let i = 1; i <= maxEvents; i++) {
            baseColumns.push({ header: `Event ${i}`, key: `event${i}`, width: 25 });
        }

        baseColumns.push(
            { header: 'Email Verified', key: 'isvalidated', width: 14 },
            { header: 'Email Sent', key: 'emailSent', width: 12 },
            { header: 'Has Entered', key: 'hasEntered', width: 12 },
            { header: 'Entry Time', key: 'entryTime', width: 20 },
            { header: 'Registered At', key: 'createdAt', width: 20 },
        );

        sheet1.columns = baseColumns;
        sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
        sheet1.getRow(1).alignment = { horizontal: 'center' };
        sheet1.views = [{ state: 'frozen', ySplit: 1 }];
        sheet1.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: baseColumns.length }
        };

        let sno = 1;
        for (const user of users) {
            const userEvents = user.events || [];
            const emailKey = user.email?.toLowerCase()?.trim();
            const purchaseInfo = purchaseMap[emailKey] || {};
            const userId = user._id.toString();
            const userTeams = teamMap[userId] || [];
            const teamNames = userTeams.map(t => `${t.eventName}: ${t.teamName} (${t.role})`).join(', ');

            // Robust field mapping: prefer explicit values from user, fallback to purchase data
            const rowData = {
                sno: sno++,
                name: user.name || purchaseInfo.userDetails?.name || '',
                email: user.email || purchaseInfo.userDetails?.email || '',
                contactNo: user.contactNo || purchaseInfo.userDetails?.contactNo || '',
                gender: user.gender || purchaseInfo.userDetails?.gender || '',
                age: user.age || purchaseInfo.userDetails?.age || '',
                universityName: user.universityName || purchaseInfo.userDetails?.universityName || '',
                address: user.address || purchaseInfo.userDetails?.address || '',
                referralCode: user.referralCode || purchaseInfo.userDetails?.formData?.referralCode || purchaseInfo.userDetails?.referralCode || '',
                referalID: user.referalID || '',
                referalcount: user.referalcount || 0,
                universityIdCard: user.universityIdCard || purchaseInfo.userDetails?.formData?.universityIdCard || purchaseInfo.userDetails?.universityIdCard || '',
                paymentStatus: purchaseInfo.paymentStatus || 'unknown',
                totalAmount: purchaseInfo.totalAmount ?? '',
                transactionId: purchaseInfo.transactionId || purchaseInfo.paymentSessionId || '',
                teams: teamNames,
                isvalidated: user.isvalidated ? 'Yes' : 'No',
                emailSent: user.emailSent ? 'Yes' : 'No',
                hasEntered: user.hasEntered ? 'Yes' : 'No',
                entryTime: user.entryTime ? new Date(user.entryTime).toLocaleString('en-IN') : '',
                createdAt: user.createdAt ? new Date(user.createdAt).toLocaleString('en-IN') : '',
            };

            for (let i = 0; i < maxEvents; i++) {
                rowData[`event${i + 1}`] = userEvents[i] || '';
            }
            sheet1.addRow(rowData);
        }

        // --- Sheet 2: Event-wise ---
        const sheet2 = workbook.addWorksheet('Event-wise');
        sheet2.columns = [
            { header: 'S.No', key: 'sno', width: 6 },
            { header: 'Event', key: 'event', width: 30 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Contact No', key: 'contactNo', width: 16 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'University', key: 'universityName', width: 30 },
            { header: 'Address', key: 'address', width: 50 },
            { header: 'Age', key: 'age', width: 8 },
            { header: 'Role', key: 'role', width: 12 },
            { header: 'Team Name', key: 'teamName', width: 20 },
            { header: 'Referral Code', key: 'referralCode', width: 15 },
            { header: 'My Referal Code', key: 'referalID', width: 20 },
            { header: 'Referal Count', key: 'referalcount', width: 12 },
            { header: 'University ID Card', key: 'universityIdCard', width: 20 },
            { header: 'Email Sent', key: 'emailSent', width: 12 },
            { header: 'Has Entered', key: 'hasEntered', width: 12 },
            { header: 'Registered At', key: 'createdAt', width: 20 },
        ];

        sheet2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };
        sheet2.getRow(1).alignment = { horizontal: 'center' };
        sheet2.views = [{ state: 'frozen', ySplit: 1 }];
        sheet2.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: sheet2.columns.length }
        };

        let sno2 = 1;
        const eventRows = [];
        for (const user of users) {
            const userId = user._id.toString();
            const userTeams = teamMap[userId] || [];
            const events = user.events || [];

            if (events.length === 0) {
                eventRows.push({
                    event: 'N/A',
                    name: user.name || '',
                    email: user.email || '',
                    contactNo: user.contactNo || '',
                    gender: user.gender || '',
                    universityName: user.universityName || '',
                    address: user.address || '',
                    age: user.age || '',
                    role: 'Individual',
                    teamName: '',
                    referralCode: user.referralCode || '',
                    referalID: user.referalID || '',
                    referalcount: user.referalcount || 0,
                    universityIdCard: user.universityIdCard || '',
                    emailSent: user.emailSent ? 'Yes' : 'No',
                    hasEntered: user.hasEntered ? 'Yes' : 'No',
                    createdAt: user.createdAt ? new Date(user.createdAt).toLocaleString('en-IN') : '',
                });
            } else {
                for (const event of events) {
                    const teamInfo = userTeams.find(t => t.eventName === event);
                    eventRows.push({
                        event,
                        name: user.name || '',
                        email: user.email || '',
                        contactNo: user.contactNo || '',
                        gender: user.gender || '',
                        universityName: user.universityName || '',
                        address: user.address || '',
                        age: user.age || '',
                        role: teamInfo ? teamInfo.role : 'Individual',
                        teamName: teamInfo ? teamInfo.teamName : '',
                        referralCode: user.referralCode || '',
                        referalID: user.referalID || '',
                        referalcount: user.referalcount || 0,
                        universityIdCard: user.universityIdCard || '',
                        emailSent: user.emailSent ? 'Yes' : 'No',
                        hasEntered: user.hasEntered ? 'Yes' : 'No',
                        createdAt: user.createdAt ? new Date(user.createdAt).toLocaleString('en-IN') : '',
                    });
                }
            }
        }

        eventRows.sort((a, b) => a.event.localeCompare(b.event));
        for (const row of eventRows) {
            sheet2.addRow({ sno: sno2++, ...row });
        }

        // --- Sheet 3: Payments ---
        const sheet3 = workbook.addWorksheet('Payments');
        sheet3.columns = [
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
            { header: 'Amount (₹)', key: 'amount', width: 12 },
            { header: 'Payment Status', key: 'paymentStatus', width: 16 },
            { header: 'Transaction ID', key: 'transactionId', width: 25 },
            { header: 'Payment Date', key: 'paymentDate', width: 22 },
        ];

        sheet3.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet3.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFED7D31' } };
        sheet3.getRow(1).alignment = { horizontal: 'center' };
        sheet3.views = [{ state: 'frozen', ySplit: 1 }];
        sheet3.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: sheet3.columns.length }
        };

        let sno3 = 1;
        for (const p of allPurchases) {
            const eventsInPurchase = (p.items || []).map(i => i.itemName).filter(Boolean).join(', ');

            // Try to find the user to get more details if not in Purchase
            let userUniversity = p.userDetails?.universityName || '';
            let userReferral = p.userDetails?.formData?.referralCode || p.userDetails?.referralCode || '';
            let userGender = p.userDetails?.gender || '';
            let userAge = p.userDetails?.age || '';
            let userAddress = p.userDetails?.address || '';
            let userUniversityIdCard = p.userDetails?.formData?.universityIdCard || p.userDetails?.universityIdCard || '';

            const userParamsToFill = !userUniversity || !userReferral || !userGender || !userAge || !userAddress || !userUniversityIdCard;

            if (userParamsToFill) {
                const user = await User.findOne({ email: p.userDetails?.email }).lean();
                if (user) {
                    if (!userUniversity) userUniversity = user.universityName || '';
                    if (!userReferral) userReferral = user.referralCode || '';
                    if (!userGender) userGender = user.gender || '';
                    if (!userAge) userAge = user.age || '';
                    if (!userAddress) userAddress = user.address || '';
                    if (!userUniversityIdCard) userUniversityIdCard = user.universityIdCard || '';
                }
            }

            sheet3.addRow({
                sno: sno3++,
                orderId: p.orderId || '',
                name: p.userDetails?.name || '',
                email: p.userDetails?.email || '',
                contactNo: p.userDetails?.contactNo || '',
                gender: userGender,
                age: userAge,
                universityName: userUniversity,
                address: userAddress,
                universityIdCard: userUniversityIdCard,
                referralCode: userReferral,
                events: eventsInPurchase,
                amount: p.totalAmount || 0,
                paymentStatus: p.paymentStatus || '',
                transactionId: p.transactionId || '',
                paymentDate: p.purchaseDate ? new Date(p.purchaseDate).toLocaleString('en-IN') : '',
            });
        }

        // --- Sheet 4: Committee Referrals ---
        const committeeResults = await analyzeCommitteeReferrals();
        const sheet4 = workbook.addWorksheet('Committee Referrals');
        sheet4.columns = [
            { header: 'Committee', key: 'committeeName', width: 30 },
            { header: 'Total Members', key: 'totalMembers', width: 15 },
            { header: 'Total Referrals', key: 'totalReferrals', width: 15 },
            { header: 'Avg Referrals/Member', key: 'avgReferrals', width: 20 },
        ];

        sheet4.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet4.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
        sheet4.getRow(1).alignment = { horizontal: 'center' };
        sheet4.views = [{ state: 'frozen', ySplit: 1 }];

        for (const committee of committeeResults) {
            sheet4.addRow({
                committeeName: committee.committeeName,
                totalMembers: committee.totalMembers,
                totalReferrals: committee.totalReferrals,
                avgReferrals: (committee.totalReferrals / committee.totalMembers).toFixed(2)
            });
        }

        // Add Member details below summary
        sheet4.addRow([]);
        sheet4.addRow({ committeeName: 'Detailed Member Referrals (Top 50 Across All Committees)' }).font = { bold: true };
        sheet4.addRow([
            'Member Roll No',
            'Committee',
            'Referrals'
        ]).font = { bold: true };

        const allMembers = [];
        committeeResults.forEach(c => {
            c.memberReferrals.forEach(m => {
                allMembers.push({
                    rollNumber: m.rollNumber,
                    committee: c.committeeName,
                    referralCount: m.referralCount
                });
            });
        });

        allMembers.sort((a, b) => b.referralCount - a.referralCount);
        allMembers.slice(0, 50).forEach(m => {
            if (m.referralCount > 0) {
                sheet4.addRow([
                    m.rollNumber,
                    m.committee,
                    m.referralCount
                ]);
            }
        });

        // Apply wrap text, vertical alignment, and borders to all cells
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
        await workbook.xlsx.writeFile(outputPath);
        return {
            success: true,
            path: outputPath,
            stats: {
                users: users.length,
                eventRows: eventRows.length,
                purchases: allPurchases.length
            }
        };
    } catch (error) {
        console.error('Excel Generation Error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = { generateExcelReport };
