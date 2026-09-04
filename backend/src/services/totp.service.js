const crypto = require('crypto');
const QRCode = require('qrcode');
const logger = require('../config/logger');

const SERVICE_NAME = 'SecureDMS-SIH26190';
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Base32 Encoding
 * @param {Buffer} buffer
 * @returns {string}
 */
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Base32 Decoding
 * @param {string} str
 * @returns {Buffer}
 */
function base32Decode(str) {
  const cleanStr = str.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleanStr.length; i++) {
    const idx = BASE32_CHARS.indexOf(cleanStr[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generate RFC 6238 TOTP Token for a given counter
 * @param {Buffer} keyBuffer
 * @param {number} counter
 * @returns {string} 6-digit code
 */
function generateHotp(keyBuffer, counter) {
  const counterBuffer = Buffer.alloc(8);
  let tempCounter = counter;
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = tempCounter & 0xff;
    tempCounter = Math.floor(tempCounter / 256);
  }

  const hmac = crypto.createHmac('sha1', keyBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * TOTP Service for Two-Factor Authentication (RFC 6238 Standard)
 */
class TotpService {
  /**
   * Generate new base32 secret and QR Code Data URL for user onboarding
   * @param {string} email - User official email
   * @returns {Promise<{ secret: string, qrCodeDataUrl: string, otpauthUrl: string }>}
   */
  async generateSecret(email) {
    const randomBytes = crypto.randomBytes(20);
    const secret = base32Encode(randomBytes);
    const label = encodeURIComponent(email || 'officer@police.gov.in');
    const issuer = encodeURIComponent(SERVICE_NAME);
    const otpauthUrl = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    try {
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        color: {
          dark: '#0B0F19',
          light: '#FFFFFF',
        },
      });

      return {
        secret,
        qrCodeDataUrl,
        otpauthUrl,
      };
    } catch (error) {
      logger.error('Failed to generate QR Code for TOTP setup', { error: error.message, email });
      throw new Error('Failed to generate 2FA QR code');
    }
  }

  /**
   * Verify a 6-digit TOTP token against user secret
   * @param {string} token - 6-digit token code
   * @param {string} secret - User base32 TOTP secret
   * @param {number} [window=1] - ±30s clock drift
   * @returns {boolean}
   */
  verifyCode(token, secret, window = 1) {
    if (!token || !secret) return false;
    try {
      const cleanToken = String(token).trim();
      if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) return false;

      const keyBuffer = base32Decode(secret);
      if (keyBuffer.length === 0) return false;

      const currentCounter = Math.floor(Date.now() / 1000 / 30);

      for (let i = -window; i <= window; i++) {
        const calculatedCode = generateHotp(keyBuffer, currentCounter + i);
        if (crypto.timingSafeEqual(Buffer.from(calculatedCode), Buffer.from(cleanToken))) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.warn('TOTP code verification error', { error: error.message });
      return false;
    }
  }

  /**
   * Generate current TOTP code (helper for testing)
   * @param {string} secret
   * @returns {string}
   */
  generateCode(secret) {
    if (!secret) return '';
    const keyBuffer = base32Decode(secret);
    const currentCounter = Math.floor(Date.now() / 1000 / 30);
    return generateHotp(keyBuffer, currentCounter);
  }
}

module.exports = new TotpService();
