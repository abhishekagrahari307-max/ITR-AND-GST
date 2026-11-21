/* TaxMitra server – one-time tokens and TOTP 2FA.

   Both use only node:crypto. Design rules:
     • Tokens are random, high-entropy, single-use, expiring, and stored HASHED
       (sha256) so a database leak cannot be replayed.
     • TOTP follows RFC 6238 (SHA-1, 30 s step, 6 digits) with a ±1 step window.
     • Backup codes are stored hashed and consumed one at a time. */

'use strict';

const crypto = require('node:crypto');

/* ------------------------------------------------------------- tokens */

function randomToken(bytes) {
  return crypto.randomBytes(bytes || 32).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/* Short, human-typable codes used for e-mail links where a long token would be
   broken by mail clients. Entropy is still ~50 bits over 10 characters. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(length) {
  const size = length || 10;
  const bytes = crypto.randomBytes(size);
  let out = '';
  for (let i = 0; i < size; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/* --------------------------------------------------------------- base32 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = B32.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/* ----------------------------------------------------------------- TOTP */

function hotp(secretBuffer, counter) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const digest = crypto.createHmac('sha1', secretBuffer).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

function generateSecret() {
  // 160 bits is the RFC 4226 recommendation for SHA-1.
  return base32Encode(crypto.randomBytes(20));
}

function totpAt(secret, timestampMs, stepSeconds) {
  const step = stepSeconds || 30;
  const counter = Math.floor((timestampMs === undefined ? Date.now() : timestampMs) / 1000 / step);
  return hotp(base32Decode(secret), counter);
}

/* Accepts the current step and one step either side, so a slightly slow phone
   clock does not lock the user out. */
function verifyTotp(secret, code, options) {
  const opts = options || {};
  const clean = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const step = opts.stepSeconds || 30;
  const now = opts.now === undefined ? Date.now() : opts.now;
  let matched = false;
  for (let drift = -1; drift <= 1; drift++) {
    const candidate = totpAt(secret, now + drift * step * 1000, step);
    // Compare all candidates without early exit on the matching one.
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) matched = true;
  }
  return matched;
}

function otpauthUrl(secret, account, issuer) {
  const label = encodeURIComponent((issuer || 'TaxMitra') + ':' + (account || 'account'));
  const params = new URLSearchParams({
    secret: secret,
    issuer: issuer || 'TaxMitra',
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return 'otpauth://totp/' + label + '?' + params.toString();
}

/* --------------------------------------------------------- backup codes */

function generateBackupCodes(count) {
  const total = count || 10;
  const codes = [];
  for (let i = 0; i < total; i++) {
    codes.push(randomCode(4) + '-' + randomCode(4));
  }
  return codes;
}

function normaliseBackupCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashBackupCode(code) {
  return hashToken(normaliseBackupCode(code));
}

module.exports = {
  randomToken,
  hashToken,
  randomCode,
  base32Encode,
  base32Decode,
  hotp,
  totpAt,
  generateSecret,
  verifyTotp,
  otpauthUrl,
  generateBackupCodes,
  normaliseBackupCode,
  hashBackupCode,
};
