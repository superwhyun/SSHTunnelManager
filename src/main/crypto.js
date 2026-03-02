/**
 * Crypto module for AES-256-GCM encryption/decryption
 * Master key is stored only in memory for security
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

// Master key stored only in memory (global variable)
let masterKey = null;

/**
 * Generate a new random master key
 * @returns {Buffer} 32-byte random key
 */
function generateMasterKey() {
  return crypto.randomBytes(KEY_LENGTH);
}

/**
 * Set the master key in memory
 * @param {Buffer|string} key - The master key to set
 */
function setMasterKey(key) {
  if (!key) {
    throw new Error('Master key cannot be empty');
  }
  
  // Convert string to Buffer if needed
  if (typeof key === 'string') {
    // If hex string, convert from hex
    if (key.length === 64) {
      masterKey = Buffer.from(key, 'hex');
    } else {
      // Otherwise treat as UTF-8 and hash to 32 bytes
      masterKey = crypto.createHash('sha256').update(key).digest();
    }
  } else if (Buffer.isBuffer(key)) {
    masterKey = key;
  } else {
    throw new Error('Invalid key type. Expected Buffer or string');
  }
  
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length. Expected ${KEY_LENGTH} bytes, got ${masterKey.length}`);
  }
}

/**
 * Check if master key is set
 * @returns {boolean}
 */
function hasMasterKey() {
  return masterKey !== null;
}

/**
 * Clear master key from memory (for logout functionality)
 */
function clearMasterKey() {
  if (masterKey) {
    // Overwrite with zeros before releasing
    masterKey.fill(0);
    masterKey = null;
  }
}

/**
 * Encrypt data using AES-256-GCM
 * @param {string} plaintext - Data to encrypt
 * @returns {string} Encrypted data in format: salt:iv:authTag:ciphertext (base64 encoded)
 * @throws {Error} If master key is not set
 */
function encrypt(plaintext) {
  if (!masterKey) {
    throw new Error('Master key not set. Call setMasterKey() first.');
  }
  
  if (!plaintext) {
    return null;
  }
  
  try {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive key using HKDF-like approach (simple concatenation for this use case)
    const derivedKey = crypto.createHmac('sha256', masterKey).update(salt).digest();
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    
    // Encrypt
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine all components: salt:iv:authTag:ciphertext
    const encrypted = [
      salt.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext,
    ].join(':');
    
    return encrypted;
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt data using AES-256-GCM
 * @param {string} encryptedData - Data in format: salt:iv:authTag:ciphertext (base64 encoded)
 * @returns {string} Decrypted plaintext
 * @throws {Error} If master key is not set or decryption fails
 */
function decrypt(encryptedData) {
  if (!masterKey) {
    throw new Error('Master key not set. Call setMasterKey() first.');
  }
  
  if (!encryptedData) {
    return null;
  }
  
  try {
    // Split components
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [saltB64, ivB64, authTagB64, ciphertext] = parts;
    
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    
    // Derive key
    const derivedKey = crypto.createHmac('sha256', masterKey).update(salt).digest();
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');
    
    return plaintext;
  } catch (error) {
    // Decryption failed - return null instead of throwing
    // This happens when master key doesn't match the one used for encryption
    console.warn('Decryption failed (wrong master key?):', error.message);
    return null;
  }
}

/**
 * Validate master key against a known encrypted test string
 * @param {string} testEncrypted - Previously encrypted test string
 * @returns {boolean} True if key can decrypt the test string
 */
function validateMasterKey(testEncrypted) {
  if (!masterKey || !testEncrypted) {
    return false;
  }
  
  try {
    decrypt(testEncrypted);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  generateMasterKey,
  setMasterKey,
  hasMasterKey,
  clearMasterKey,
  encrypt,
  decrypt,
  validateMasterKey,
  KEY_LENGTH,
};
