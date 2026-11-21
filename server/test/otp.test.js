/* Unit tests for TOTP, base32 and one-time tokens. */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const otp = require('../lib/otp');

test('base32 round-trips arbitrary bytes', () => {
  const buffer = Buffer.from([0, 1, 2, 250, 251, 255, 17]);
  assert.deepEqual(otp.base32Decode(otp.base32Encode(buffer)), buffer);
});

test('base32 ignores spaces and lower case, as authenticator apps do', () => {
  const secret = otp.generateSecret();
  const spaced = secret.toLowerCase().replace(/(.{4})/g, '$1 ');
  assert.deepEqual(otp.base32Decode(spaced), otp.base32Decode(secret));
});

test('hotp matches the RFC 4226 test vector for counter 1', () => {
  // ASCII "12345678901234567890" is the RFC 4226/6238 shared secret.
  const secret = Buffer.from('12345678901234567890', 'ascii');
  assert.equal(otp.hotp(secret, 1), '287082');
});

test('totp matches the RFC 6238 SHA-1 vector (T=59)', () => {
  const base32 = otp.base32Encode(Buffer.from('12345678901234567890', 'ascii'));
  assert.equal(otp.totpAt(base32, 59 * 1000), '287082');
});

test('totp verification accepts one step of clock drift and nothing more', () => {
  const secret = otp.generateSecret();
  const now = 1_700_000_000_000;
  const current = otp.totpAt(secret, now);
  assert.equal(otp.verifyTotp(secret, current, { now }), true);

  const previous = otp.totpAt(secret, now - 30_000);
  const next = otp.totpAt(secret, now + 30_000);
  assert.equal(otp.verifyTotp(secret, previous, { now }), true);
  assert.equal(otp.verifyTotp(secret, next, { now }), true);

  const far = otp.totpAt(secret, now - 120_000);
  assert.equal(otp.verifyTotp(secret, far, { now }), false);
});

test('totp verification rejects malformed codes', () => {
  const secret = otp.generateSecret();
  for (const bad of ['', null, '12345', '1234567', 'abcdef', '  ']) {
    assert.equal(otp.verifyTotp(secret, bad), false, String(bad));
  }
});

test('secrets are 160-bit base32 and unique', () => {
  const a = otp.generateSecret();
  const b = otp.generateSecret();
  assert.match(a, /^[A-Z2-7]{32}$/);
  assert.notEqual(a, b);
});

test('the otpauth URL is well formed and escaped', () => {
  const url = otp.otpauthUrl('JBSWY3DPEHPK3PXP', 'user+tag@example.com', 'TaxMitra');
  assert.match(url, /^otpauth:\/\/totp\//);
  assert.match(url, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(url, /issuer=TaxMitra/);
  assert.match(url, /digits=6/);
  assert.match(url, /period=30/);
  assert.ok(url.includes('user%2Btag%40example.com'), 'the label must be URL-encoded');
});

test('tokens are long, urlsafe and hash deterministically', () => {
  const token = otp.randomToken(32);
  assert.ok(token.length >= 40);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(otp.hashToken(token), otp.hashToken(token));
  assert.notEqual(otp.hashToken(token), otp.hashToken(token + 'x'));
});

test('backup codes are grouped, unique and hash case-insensitively', () => {
  const codes = otp.generateBackupCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  codes.forEach((code) => assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/));

  const hashed = otp.hashBackupCode(codes[0]);
  assert.equal(otp.hashBackupCode(codes[0].toLowerCase()), hashed);
  assert.equal(otp.hashBackupCode(codes[0].replace('-', ' ')), hashed);
  assert.notEqual(otp.hashBackupCode(codes[1]), hashed);
});
