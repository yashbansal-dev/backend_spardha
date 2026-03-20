const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
require('dotenv').config();
const { User } = require('./models/models');

async function exportUsersToExcel() {
    try {
        const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        console.log('Fetching users...');
        const users = await User.find().sort({ createdAt: -1 });
        console.log(`📊 Found ${users.length} users. Generating Excel...`);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('All Users');

        // Define columns
        worksheet.columns = [
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Contact No', key: 'contactNo', width: 15 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'Age', key: 'age', width: 8 },
            { header: 'University', key: 'universityName', width: 30 },
            { header: 'Address', key: 'address', width: 40 },
            { header: 'Events', key: 'events', width: 40 },
            { header: 'Referral Code', key: 'referralCode', width: 15 },
            { header: 'Registration Date', key: 'createdAt', width: 25 }
        ];

        // Add rows
        users.forEach(user => {
            worksheet.addRow({
                name: user.name || 'N/A',
                email: user.email || 'N/A',
                contactNo: user.contactNo || 'N/A',
                gender: user.gender || 'N/A',
                age: user.age || 'N/A',
                universityName: user.universityName || 'N/A',
                address: user.address || 'N/A',
                events: Array.isArray(user.events) ? user.events.join(', ') : 'None',
                referralCode: user.referralCode || 'N/A',
                createdAt: user.createdAt ? user.createdAt.toLocaleString() : 'N/A'
            });
        });

        // Style the header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        const fileName = 'all_users.xlsx';
        await workbook.xlsx.writeFile(fileName);
        console.log(`✅ Excel file generated: ${fileName}`);

    } catch (err) {
        console.error('🔥 Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

exportUsersToExcel();
