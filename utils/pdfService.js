const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate a formal PDF Invoice
 * @param {Object} data - Invoice data (name, email, orderId, items, total, date)
 * @returns {Promise<Buffer>} - PDF Buffer
 */
async function generateInvoicePDF(data) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            // --- Header ---
            doc.fillColor('#E37233').fontSize(25).text('SPARDHA\'26', 50, 50);
            doc.fillColor('#444444').fontSize(10).text('Annual Sports Fest', 50, 80);
            doc.fontSize(10).text('JK Lakshmipat University', 50, 95);
            doc.text('Mahindra SEZ, Jaipur, Rajasthan', 50, 110);

            doc.fillColor('#000000').fontSize(20).text('INVOICE', 400, 50, { align: 'right' });
            doc.fontSize(10).text(`Invoice #: INV-${data.orderId.split('_')[1] || uuidv4().slice(0, 8)}`, 400, 80, { align: 'right' });
            doc.text(`Date: ${new Date().toLocaleDateString()}`, 400, 95, { align: 'right' });
            doc.text(`Order ID: ${data.orderId}`, 400, 110, { align: 'right' });

            doc.moveTo(50, 130).lineTo(550, 130).stroke();

            // --- Bill To ---
            doc.fontSize(12).text('BILL TO:', 50, 150);
            doc.fontSize(10).text(data.name, 50, 170);
            doc.text(data.email, 50, 185);
            if (data.universityName) doc.text(data.universityName, 50, 200);

            // --- Table Header ---
            let tableTop = 240;
            doc.fillColor('#f2f2f2').rect(50, tableTop, 500, 20).fill();
            doc.fillColor('#000000').fontSize(10).text('Item Description', 60, tableTop + 5);
            doc.text('Qty', 350, tableTop + 5);
            doc.text('Price', 400, tableTop + 5);
            doc.text('Amount', 480, tableTop + 5);

            // --- Table Items ---
            let rowY = tableTop + 25;
            data.items.forEach(item => {
                doc.text(item.itemName, 60, rowY);
                doc.text(item.quantity.toString(), 350, rowY);
                doc.text(`Rs. ${item.price}`, 400, rowY);
                doc.text(`Rs. ${item.price * item.quantity}`, 480, rowY);
                rowY += 20;
            });

            doc.moveTo(50, rowY).lineTo(550, rowY).stroke();

            // --- Total ---
            rowY += 10;
            doc.fontSize(12).text('Total Amount:', 350, rowY, { bold: true });
            doc.fontSize(12).text(`Rs. ${data.totalAmount}`, 480, rowY, { bold: true });

            // --- Footer ---
            doc.fontSize(10).fillColor('#888888').text('Thank you for registering for Spardha\'26!', 50, 700, { align: 'center', width: 500 });
            doc.text('This is a computer-generated document.', 50, 715, { align: 'center', width: 500 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Generate a visually appealing Digital Ticket / Poster
 * @param {Object} data - Ticket data (name, events, qrCodeBase64, orderId)
 * @returns {Promise<Buffer>} - PDF Buffer
 */
async function generateTicketPosterPDF(data) {
    return new Promise((resolve, reject) => {
        try {
            // A4 page with dark theme
            const doc = new PDFDocument({ size: 'A4', margin: 0 });
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            // Background Color (Dark Blue/Black)
            doc.rect(0, 0, 595.28, 841.89).fill('#020617');

            // --- Header Decoration ---
            doc.rect(0, 0, 595.28, 150).fill('#E37233');
            doc.fillColor('#FFFFFF').fontSize(40).text('SPARDHA \'26', 0, 55, { align: 'center' });
            doc.fontSize(15).text('OFFICIAL ENTRY TICKET', 0, 100, { align: 'center' });

            // --- Content ---
            doc.fillColor('#FFFFFF');
            doc.fontSize(25).text('Hello,', 50, 200);
            doc.fontSize(35).fillColor('#F2995C').text(data.name.toUpperCase(), 50, 230);

            doc.fillColor('#FFFFFF').fontSize(18).text('You are registered for:', 50, 300);
            
            let eventsText = Array.isArray(data.events) ? data.events.join(', ') : data.events;
            doc.fontSize(20).fillColor('#fbbf24').text(eventsText, 50, 330, { width: 500 });

            // --- QR Code Section ---
            const qrSize = 200;
            const qrX = (595.28 - qrSize) / 2;
            const qrY = 450;
            
            // White background for QR code
            doc.rect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20).fill('#FFFFFF');
            
            if (data.qrCodeBase64) {
                const qrBuffer = Buffer.from(data.qrCodeBase64, 'base64');
                doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
            }

            doc.fillColor('#FFFFFF').fontSize(12).text('SCAN FOR ENTRY', 0, qrY + qrSize + 20, { align: 'center' });
            doc.fontSize(10).fillColor('#94a3b8').text(`Order ID: ${data.orderId}`, 0, qrY + qrSize + 40, { align: 'center' });

            // --- Footer ---
            doc.rect(0, 790, 595.28, 52).fill('#E37233');
            doc.fillColor('#FFFFFF').fontSize(12).text('JK LAKSHMIPAT UNIVERSITY, JAIPUR', 0, 810, { align: 'center' });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    generateInvoicePDF,
    generateTicketPosterPDF
};
