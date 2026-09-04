const crypto = require('crypto');

/**
 * Calculate SHA-256 hash of a Buffer or String
 * @param {Buffer|string} data
 * @returns {string} 64-character hexadecimal SHA-256 hash
 */
function calculateSha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Compute Cryptographic Audit Log Chained Hash
 * Combines previous block hash + structured log payload to create tamper-evident chain
 * @param {string} previousHash - Hex hash of previous audit log (or GENESIS_HASH)
 * @param {object} payload - Audit log contents
 * @returns {string} SHA-256 hash
 */
const GENESIS_HASH = '0'.repeat(64);

function calculateAuditHash(previousHash, payload) {
  const normalizedPrev = previousHash || GENESIS_HASH;
  const canonicalPayload = JSON.stringify(payload, Object.keys(payload).sort());
  return calculateSha256(`${normalizedPrev}:${canonicalPayload}`);
}

/**
 * Timing-safe string comparison to prevent timing attacks on hashes/tokens
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Encrypt a string using AES-256-GCM
 * @param {string} plaintext 
 * @param {string} masterKeyHex - 64 character hex string (32 bytes)
 * @returns {object} { ciphertext, iv, authTag, isEncrypted: true }
 */
function encryptAES256GCM(plaintext, masterKeyHex) {
  if (!plaintext) return null;
  const key = Buffer.from(masterKeyHex, 'hex');
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return {
    isEncrypted: true,
    iv: iv.toString('hex'),
    authTag,
    ciphertext
  };
}

/**
 * Decrypt a string using AES-256-GCM
 * @param {object} encryptedData - { ciphertext, iv, authTag }
 * @param {string} masterKeyHex - 64 character hex string (32 bytes)
 * @returns {string} plaintext
 */
function decryptAES256GCM(encryptedData, masterKeyHex) {
  if (!encryptedData || !encryptedData.ciphertext) return null;
  
  const key = Buffer.from(masterKeyHex, 'hex');
  const iv = Buffer.from(encryptedData.iv, 'hex');
  const authTag = Buffer.from(encryptedData.authTag, 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let plaintext = decipher.update(encryptedData.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  
  return plaintext;
}

/**
 * Iterates through extractedFields on a document and decrypts any encrypted values.
 * Mutates the doc object in place (suitable for leaned Mongoose documents).
 * @param {object} doc - Mongoose leaned document
 * @param {string} masterKeyHex - 64 character hex string
 */
function decryptDocumentFields(doc, masterKeyHex) {
  if (!doc || !doc.extractedFields) return doc;

  for (const [key, fieldObj] of Object.entries(doc.extractedFields)) {
    if (fieldObj && typeof fieldObj === 'object') {
      try {
        if (fieldObj.isEncrypted) {
          if (fieldObj.aiValue && typeof fieldObj.aiValue === 'object' && fieldObj.aiValue.ciphertext) {
            fieldObj.aiValue = decryptAES256GCM(fieldObj.aiValue, masterKeyHex);
          }
          if (fieldObj.humanValue && typeof fieldObj.humanValue === 'object' && fieldObj.humanValue.ciphertext) {
            fieldObj.humanValue = decryptAES256GCM(fieldObj.humanValue, masterKeyHex);
          }
          if (fieldObj.value && typeof fieldObj.value === 'object' && fieldObj.value.ciphertext) {
            fieldObj.value = decryptAES256GCM(fieldObj.value, masterKeyHex);
          }
          fieldObj.isEncrypted = false;
        }
      } catch (err) {
        // preserve field as-is if decryption fails
      }
    }
  }
  return doc;
}

module.exports = {
  calculateSha256,
  calculateAuditHash,
  timingSafeEqual,
  encryptAES256GCM,
  decryptAES256GCM,
  decryptDocumentFields,
  GENESIS_HASH,
};
