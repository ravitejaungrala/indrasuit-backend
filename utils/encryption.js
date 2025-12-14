import crypto from 'crypto';

// Encryption configuration
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// Get encryption key from environment variable
// Must be 32 bytes (64 hex characters)
const getEncryptionKey = () => {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  
  return Buffer.from(key, 'hex');
};

/**
 * Encrypt sensitive data
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text in format: iv:encryptedData
 */
function encrypt(text) {
  if (!text) return text;
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return IV and encrypted data separated by colon
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error.message);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt encrypted data
 * @param {string} text - Encrypted text in format: iv:encryptedData
 * @returns {string} - Decrypted plain text
 */
function decrypt(text) {
  if (!text) return text;
  
  try {
    const parts = text.split(':');
    
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Generate a random encryption key
 * @returns {string} - 64 character hex string (32 bytes)
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Check if text is already encrypted
 * @param {string} text - Text to check
 * @returns {boolean} - True if encrypted
 */
function isEncrypted(text) {
  if (!text) return false;
  
  // Check if format matches iv:encryptedData (both parts should be hex)
  const parts = text.split(':');
  if (parts.length !== 2) return false;
  
  const hexRegex = /^[0-9a-f]+$/i;
  return hexRegex.test(parts[0]) && hexRegex.test(parts[1]) && parts[0].length === 32;
}

export {
  encrypt,
  decrypt,
  generateEncryptionKey,
  isEncrypted
};
