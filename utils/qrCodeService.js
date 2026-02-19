const QRCode = require('qrcode');

/**
 * Generate QR code as base64 string
 * @param {string} data - The data to encode in the QR code
 * @param {Object} options - QR code generation options
 * @returns {Promise<string>} - Base64 encoded QR code image (without prefix)
 */
async function generateQRCodeBase64(data, options = {}) {
  try {
    // Validate input data
    if (!data || typeof data !== 'string') {
      throw new Error(`Invalid data for QR code generation: ${typeof data} - ${data}`);
    }

    if (data.length === 0) {
      throw new Error('Empty data provided for QR code generation');
    }

    console.log(`🔍 Generating QR code with data: "${data}" (length: ${data.length})`);

    // Default options for better visibility (White Background)
    const defaultOptions = {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 2,
      scale: 10,
      color: {
        dark: '#000000',  // Black dots
        light: '#FFFFFF'  // White background (Crucial for dark mode scanning)
      }
    };

    const qrOptions = { ...defaultOptions, ...options };

    // Generate QR code as Data URL
    const dataUrl = await QRCode.toDataURL(data, qrOptions);

    // Remove the data URL prefix (e.g., "data:image/png;base64,") to get raw base64
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

    console.log(`🔍 QR code generated successfully, base64 length: ${base64.length}`);
    return base64;

  } catch (error) {
    console.error('❌ QR code generation error:', error);
    throw error;
  }
}

/**
 * Generate QR code data for user/team member
 * @param {string} userId - User or team member ID
 * @param {Object} userData - User data object
 * @returns {string} - Simple ID string
 */
function generateQRData(userId, userData) {
  // Validate and clean the user ID
  if (!userId) {
    throw new Error('User ID is required for QR code generation');
  }

  // Convert to string and clean any invalid characters
  const cleanId = String(userId).trim();

  if (!cleanId) {
    throw new Error('User ID is empty after cleaning');
  }

  console.log(`🔍 Cleaned user ID for QR: ${cleanId}`);

  // Point to the User Ticket Page (Payment Success Page)
  // Requires orderId to be passed in userData
  const orderId = userData.orderId;
  const baseUrl = process.env.FRONTEND_URL || 'https://spardha.jklu.edu.in';

  let verificationUrl;
  if (orderId) {
    verificationUrl = `${baseUrl}/payment/success?order_id=${orderId}`;
  } else {
    // Fallback if orderId is missing (links to general ticket page)
    verificationUrl = `${baseUrl}/ticket`;
  }

  return verificationUrl;
}

/**
 * Generate QR code for user/team member and return base64
 * @param {string} userId - User or team member ID
 * @param {Object} userData - User data object
 * @param {Object} options - QR code generation options
 * @returns {Promise<string>} - Base64 encoded QR code image
 */
async function generateUserQRCode(userId, userData, options = {}) {
  try {
    const qrData = generateQRData(userId, userData);
    console.log(`🔍 QR data to encode: ${qrData}`);
    const base64 = await generateQRCodeBase64(qrData, options);
    console.log(`✅ QR code generated as base64 for user: ${userId}, base64 length: ${base64 ? base64.length : 'null'}`);
    return base64;
  } catch (error) {
    console.error(`❌ Failed to generate QR code for user ${userId}:`, error);
    throw error;
  }
}

module.exports = {
  generateQRCodeBase64,
  generateQRData,
  generateUserQRCode
};
