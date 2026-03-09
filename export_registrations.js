require('dotenv').config();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const { User, Purchase, TeamComposition } = require('./models/models');
const path = require('path');

async function exportRegistrations() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.mongodb);
        console.log('Connected!');

        // Fetch all users who have at least one event registered
        const users = await User.find({}).lean();
        console.log(`Total users found: ${users.length}`);

        // Also fetch completed purchases for payment info
        const purchases = await Purchase.find({ paymentStatus: 'completed' }).lean();
        const purchaseMap = {};
        for (const p of purchases) {
            const key = p.mainPersonId?.toString() || p.userId?.toString();
            if (key) {
                if (!purchaseMap[key]) purchaseMap[key] = [];
                purchaseMap[key].push(p);
            }
        }

        // Fetch all team compositions
        const teams = await TeamComposition.find({}).lean();
        // Map userId -> team info
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

        // ─── Sheet 1: All Registrants ────────────────────────────────────────────
        const sheet1 = workbook.addWorksheet('All Registrants');
        sheet1.columns = [
            { header: 'S.No', key: 'sno', width: 6 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Contact No', key: 'contactNo', width: 16 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'Age', key: 'age', width: 6 },
            { header: 'University', key: 'universityName', width: 30 },
            { header: 'Address', key: 'address', width: 35 },
            { header: 'Events Registered', key: 'events', width: 40 },
            { header: 'Email Verified', key: 'isvalidated', width: 14 },
            { header: 'Email Sent', key: 'emailSent', width: 12 },
            { header: 'Has Entered', key: 'hasEntered', width: 12 },
            { header: 'Entry Time', key: 'entryTime', width: 20 },
            { header: 'Registered At', key: 'createdAt', width: 20 },
        ];

        // Style header row
        sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
        sheet1.getRow(1).alignment = { horizontal: 'center' };

        let sno = 1;
        for (const user of users) {
            sheet1.addRow({
                sno: sno++,
                name: user.name || '',
                email: user.email || '',
                contactNo: user.contactNo || '',
                gender: user.gender || '',
                age: user.age || '',
                universityName: user.universityName || '',
                address: user.address || '',
                events: (user.events || []).join(', '),
                isvalidated: user.isvalidated ? 'Yes' : 'No',
                emailSent: user.emailSent ? 'Yes' : 'No',
                hasEntered: user.hasEntered ? 'Yes' : 'No',
                entryTime: user.entryTime ? new Date(user.entryTime).toLocaleString('en-IN') : '',
                createdAt: user.createdAt ? new Date(user.createdAt).toLocaleString('en-IN') : '',
            });
        }

        // Auto-filter
        sheet1.autoFilter = { from: 'A1', to: 'M1' };

        // ─── Sheet 2: Event-wise Breakdown ──────────────────────────────────────
        const sheet2 = workbook.addWorksheet('Event-wise');
        sheet2.columns = [
            { header: 'S.No', key: 'sno', width: 6 },
            { header: 'Event', key: 'event', width: 30 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Contact No', key: 'contactNo', width: 16 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'University', key: 'universityName', width: 30 },
            { header: 'Role', key: 'role', width: 12 },
            { header: 'Team Name', key: 'teamName', width: 20 },
            { header: 'Email Sent', key: 'emailSent', width: 12 },
            { header: 'Has Entered', key: 'hasEntered', width: 12 },
        ];

        sheet2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };
        sheet2.getRow(1).alignment = { horizontal: 'center' };

        let sno2 = 1;
        // Build event-wise rows
        const eventRows = [];
        for (const user of users) {
            const userId = user._id.toString();
            const userTeams = teamMap[userId] || [];
            const events = user.events || [];

            if (events.length === 0) {
                // Include users even without events
                eventRows.push({
                    event: 'N/A',
                    name: user.name || '',
                    email: user.email || '',
                    contactNo: user.contactNo || '',
                    gender: user.gender || '',
                    universityName: user.universityName || '',
                    role: 'Individual',
                    teamName: '',
                    emailSent: user.emailSent ? 'Yes' : 'No',
                    hasEntered: user.hasEntered ? 'Yes' : 'No',
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
                        role: teamInfo ? teamInfo.role : 'Individual',
                        teamName: teamInfo ? teamInfo.teamName : '',
                        emailSent: user.emailSent ? 'Yes' : 'No',
                        hasEntered: user.hasEntered ? 'Yes' : 'No',
                    });
                }
            }
        }

        // Sort by event name
        eventRows.sort((a, b) => a.event.localeCompare(b.event));
        for (const row of eventRows) {
            sheet2.addRow({ sno: sno2++, ...row });
        }
        sheet2.autoFilter = { from: 'A1', to: 'K1' };

        // ─── Sheet 3: Payment Summary ─────────────────────────────────────────
        const sheet3 = workbook.addWorksheet('Payments');
        sheet3.columns = [
            { header: 'S.No', key: 'sno', width: 6 },
            { header: 'Order ID', key: 'orderId', width: 28 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Contact No', key: 'contactNo', width: 16 },
            { header: 'Events', key: 'events', width: 40 },
            { header: 'Amount (₹)', key: 'amount', width: 12 },
            { header: 'Payment Status', key: 'paymentStatus', width: 16 },
            { header: 'Transaction ID', key: 'transactionId', width: 25 },
            { header: 'Payment Date', key: 'paymentDate', width: 22 },
        ];

        sheet3.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet3.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFED7D31' } };
        sheet3.getRow(1).alignment = { horizontal: 'center' };

        let sno3 = 1;
        const allPurchases = await Purchase.find({}).sort({ purchaseDate: 1 }).lean();
        for (const p of allPurchases) {
            const eventsInPurchase = (p.items || []).map(i => i.itemName).filter(Boolean).join(', ');
            sheet3.addRow({
                sno: sno3++,
                orderId: p.orderId || '',
                name: p.userDetails?.name || '',
                email: p.userDetails?.email || '',
                contactNo: p.userDetails?.contactNo || '',
                events: eventsInPurchase,
                amount: p.totalAmount || 0,
                paymentStatus: p.paymentStatus || '',
                transactionId: p.transactionId || '',
                paymentDate: p.purchaseDate ? new Date(p.purchaseDate).toLocaleString('en-IN') : '',
            });
        }
        sheet3.autoFilter = { from: 'A1', to: 'J1' };

        // Save file
        const outputPath = path.join(__dirname, 'registrations_export.xlsx');
        await workbook.xlsx.writeFile(outputPath);
        console.log(`\n✅ Excel file saved to: ${outputPath}`);
        console.log(`   Total registrants: ${users.length}`);
        console.log(`   Total event-wise rows: ${eventRows.length}`);
        console.log(`   Total purchases: ${allPurchases.length}`);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

exportRegistrations();
