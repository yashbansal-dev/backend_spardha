const qr = require('qr-image');

/**
 * Generate QR code as base64 string
 * @param {string} data - The data to encode in the QR code
 * @param {Object} options - QR code generation options
 * @returns {Promise<string>} - Base64 encoded QR code image
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
    
    const defaultOptions = {
      type: 'png',
      size: 10,
      margin: 1
    };
    
    const qrOptions = { ...defaultOptions, ...options };
    
    return new Promise((resolve, reject) => {
      try {
        const qrPng = qr.image(data, qrOptions);
        const chunks = [];
        
        qrPng.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        qrPng.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const base64 = buffer.toString('base64');
          console.log(`🔍 QR code generated successfully, base64 length: ${base64.length}`);
          resolve(base64);
        });
        
        qrPng.on('error', (error) => {
          console.error('❌ QR code generation failed:', error);
          reject(error);
        });
      } catch (qrError) {
        console.error('❌ Error creating QR image:', qrError);
        reject(qrError);
      }
    });
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
  return cleanId;
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
