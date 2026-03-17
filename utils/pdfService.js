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
            // A4 page (595.28 x 841.89)
            const doc = new PDFDocument({ size: 'A4', margin: 0 });
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const pageWidth = 595.28;
            const pageHeight = 841.89;

            // --- 1. Background Gradient ---
            const grad = doc.linearGradient(0, 0, pageWidth, pageHeight);
            grad.stop(0, '#020617')  // Deep Navy
                .stop(1, '#0f172a'); // Slightly lighter Navy
            doc.rect(0, 0, pageWidth, pageHeight).fill(grad);

            // --- 2. Ticket Main Body (Card) ---
            const cardMargin = 40;
            const cardWidth = pageWidth - (cardMargin * 2);
            const cardHeight = pageHeight - (cardMargin * 2);
            const cardX = cardMargin;
            const cardY = cardMargin;

            // Draw Card Background
            doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 15).fill('#1e293b');

            // --- 3. Ticket Header (Orange Section) ---
            doc.save();
            doc.roundedRect(cardX, cardY, cardWidth, 180, { topLeft: 15, topRight: 15 }).clip();
            doc.rect(cardX, cardY, cardWidth, 180).fill('#E37233');
            
            // Branding
            doc.fillColor('#FFFFFF').fontSize(45).text('SPARDHA \'26', cardX, cardY + 50, { align: 'center', width: cardWidth });
            doc.fontSize(14).text('OFFICIAL ENTRY PASS', cardX, cardY + 110, { align: 'center', width: cardWidth, characterSpacing: 2 });
            doc.restore();

            // --- 4. Ticket-Stub Logic (The Cutout Aesthetic) ---
            const stubY = cardY + 500;
            
            // Side Cutouts (Circles)
            doc.fillColor('#020617').circle(cardX, stubY, 20).fill();
            doc.fillColor('#020617').circle(cardX + cardWidth, stubY, 20).fill();
            
            // Dash Line Divider
            doc.strokeColor('#334155').lineWidth(2).dash(10, { space: 10 }).moveTo(cardX + 25, stubY).lineTo(cardX + cardWidth - 25, stubY).stroke().undash();

            // --- 5. User Information Section ---
            doc.fillColor('#F2995C').fontSize(30).text(data.name.toUpperCase(), cardX + 30, cardY + 220, { width: cardWidth - 60 });
            
            doc.fillColor('#94a3b8').fontSize(12).text('PARTICIPANT NAME', cardX + 30, cardY + 205);

            // Events Section
            doc.fillColor('#94a3b8').fontSize(12).text('REGISTERED EVENTS', cardX + 30, cardY + 310);
            
            let eventsText = Array.isArray(data.events) ? data.events.join(' • ') : data.events;
            doc.fillColor('#FFFFFF').fontSize(22).text(eventsText, cardX + 30, cardY + 330, { width: cardWidth - 60 });

            // ID Details
            doc.fillColor('#94a3b8').fontSize(10).text('ORDER ID', cardX + 30, cardY + 440);
            doc.fillColor('#FFFFFF').fontSize(14).text(data.orderId, cardX + 30, cardY + 455);

            // --- 6. QR Code Section (Bottom Stub) ---
            const qrSize = 180;
            const qrX = cardX + (cardWidth - qrSize) / 2;
            const qrY = stubY + 60;
            
            // QR Badge Background
            doc.roundedRect(qrX - 15, qrY - 15, qrSize + 30, qrSize + 30, 10).fill('#FFFFFF');
            
            if (data.qrCodeBase64) {
                const qrBuffer = Buffer.from(data.qrCodeBase64, 'base64');
                doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
            }

            doc.fillColor('#64748b').fontSize(10).text('SCAN AT THE GATE FOR ENTRY', cardX, qrY + qrSize + 30, { align: 'center', width: cardWidth });
            
            // --- 7. Branding at Bottom ---
            doc.fillColor('#E37233').fontSize(12).text('JK LAKSHMIPAT UNIVERSITY, JAIPUR', cardX, cardY + cardHeight - 40, { align: 'center', width: cardWidth });

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
