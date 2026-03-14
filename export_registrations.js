require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { generateExcelReport } = require('./utils/excelExport');

async function exportRegistrations() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.mongodb);
        console.log('Connected!');

        const publicDir = path.join(__dirname, 'public');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }
        const outputPath = path.join(publicDir, 'registrations_export.xlsx');

        const result = await generateExcelReport(outputPath);

        if (result.success) {
            console.log(`\n✅ Excel file saved to: ${result.path}`);
            console.log(`🔗 Accessible at: /public/registrations_export.xlsx`);
            console.log(`   Total registrants: ${result.stats.users}`);
            console.log(`   Total event-wise rows: ${result.stats.eventRows}`);
            console.log(`   Total purchases: ${result.stats.purchases}`);
        } else {
            console.error('❌ Failed to generate report:', result.error);
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

exportRegistrations();

