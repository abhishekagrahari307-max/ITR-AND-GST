/* TaxMitra server – WebAuthn / passkeys, verified with node:crypto only.

   What is verified (this matters, so it is spelled out):
     • clientDataJSON type, challenge and origin
     • authenticatorData rpIdHash against the configured RP ID
     • the User Present flag (and User Verified when the RP asks for it)
     • the signature over authenticatorData || SHA-256(clientDataJSON)
     • the signature counter never moving backwards (clone detection)

   What is NOT verified: the attestation statement. Passkeys created by platform
   authenticators use "none" attestation, and this server has no attestation
   policy. That is a documented choice, not an oversight — the credential is
   still bound to the RP and to the user's device.

   Supported key types: ES256 (P-256) and RS256, which is what every platform
   authenticator and security key produces today. */

'use strict';

const crypto = require('node:crypto');

/* ------------------------------------------------------------ base64url */

function toB64url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value) {
  const str = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str + pad, 'base64');
}

/* ------------------------------------------------------------------ CBOR */

/* Minimal decoder: unsigned/negative ints, byte and text strings, arrays, maps,
   tags (skipped) and simple values. Definite lengths only — which is all CTAP
   sends for the structures we read. */
function cborDecode(buffer, offset) {
  let pos = offset || 0;

  function readLength(additional) {
    if (additional < 24) return additional;
    if (additional === 24) { const v = buffer[pos]; pos += 1; return v; }
    if (additional === 25) { const v = buffer.readUInt16BE(pos); pos += 2; return v; }
    if (additional === 26) { const v = buffer.readUInt32BE(pos); pos += 4; return v; }
    if (additional === 27) {
      const big = buffer.readBigUInt64BE(pos);
      pos += 8;
      return Number(big);
    }
    throw new Error('Unsupported CBOR length encoding: ' + additional);
  }

  function decode() {
    if (pos >= buffer.length) throw new Error('CBOR input ended unexpectedly');
    const first = buffer[pos];
    pos += 1;
    const major = first >> 5;
    const additional = first & 0x1f;

    if (major === 0) return readLength(additional);
    if (major === 1) return -1 - readLength(additional);
    if (major === 2) {
      const length = readLength(additional);
      const value = buffer.subarray(pos, pos + length);
      pos += length;
      return value;
    }
    if (major === 3) {
      const length = readLength(additional);
      const value = buffer.subarray(pos, pos + length).toString('utf8');
      pos += length;
      return value;
    }
    if (major === 4) {
      const length = readLength(additional);
      const out = [];
      for (let i = 0; i < length; i++) out.push(decode());
      return out;
    }
    if (major === 5) {
      const length = readLength(additional);
      const out = {};
      for (let i = 0; i < length; i++) {
        const key = decode();
        const value = decode();
        out[typeof key === 'string' ? key : String(key)] = value;
      }
      return out;
    }
    if (major === 6) {
      readLength(additional);
      return decode(); // tags carry no meaning for us
    }
    // major 7: simple values / floats
    if (additional === 20) return false;
    if (additional === 21) return true;
    if (additional === 22) return null;
    if (additional === 23) return undefined;
    if (additional === 25) { const v = buffer.readUInt16BE(pos); pos += 2; return v; }
    if (additional === 26) { const v = buffer.readFloatBE(pos); pos += 4; return v; }
    if (additional === 27) { const v = buffer.readDoubleBE(pos); pos += 8; return v; }
    return null;
  }

  return { value: decode(), offset: pos };
}

/* ------------------------------------------------------------- authData */

function parseAuthData(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 37) throw new Error('authenticatorData is too short');
  const rpIdHash = buffer.subarray(0, 32);
  const flags = buffer[32];
  const counter = buffer.readUInt32BE(33);
  let pos = 37;
  let aaguid = null;
  let credentialId = null;
  let coseKey = null;

  const hasAttestedData = (flags & 0x40) !== 0;
  if (hasAttestedData) {
    aaguid = buffer.subarray(pos, pos + 16);
    pos += 16;
    const idLength = buffer.readUInt16BE(pos);
    pos += 2;
    credentialId = buffer.subarray(pos, pos + idLength);
    pos += idLength;
    const { value, offset } = cborDecode(buffer, pos);
    coseKey = value;
    pos = offset;
  }

  return {
    rpIdHash,
    flags,
    counter,
    userPresent: (flags & 0x01) !== 0,
    userVerified: (flags & 0x04) !== 0,
    hasAttestedData,
    aaguid,
    credentialId,
    coseKey,
    trailing: buffer.subarray(pos),
  };
}

/* ------------------------------------------------------- COSE → JWK */

function coseToJwk(cose) {
  if (!cose || typeof cose !== 'object') throw new Error('Missing COSE key');
  const kty = cose[1];
  if (kty === 2) {
    // EC2: {3: alg, -1: crv, -2: x, -3: y}
    const alg = cose[3];
    if (alg !== -7) throw new Error('Only ES256 (-7) EC keys are supported, got ' + alg);
    const crv = cose[-1];
    if (crv !== 1) throw new Error('Only P-256 (crv 1) is supported, got ' + crv);
    return {
      kty: 'EC',
      crv: 'P-256',
      x: toB64url(cose[-2]),
      y: toB64url(cose[-3]),
      ext: true,
    };
  }
  if (kty === 3) {
    // RSA: {3: alg, -1: n, -2: e}
    const alg = cose[3];
    if (alg !== -257) throw new Error('Only RS256 (-257) RSA keys are supported, got ' + alg);
    return {
      kty: 'RSA',
      n: toB64url(cose[-1]),
      e: toB64url(cose[-2]),
      alg: 'RS256',
      ext: true,
    };
  }
  throw new Error('Unsupported COSE key type: ' + kty);
}

/* --------------------------------------------------------- verification */

function parseClientData(clientDataJSON) {
  let data;
  try {
    data = JSON.parse(Buffer.from(fromB64url(clientDataJSON)).toString('utf8'));
  } catch (e) {
    try {
      data = JSON.parse(Buffer.from(clientDataJSON, 'base64').toString('utf8'));
    } catch (inner) {
      throw new Error('clientDataJSON is not valid JSON');
    }
  }
  if (!data || typeof data !== 'object') throw new Error('clientDataJSON is empty');
  return data;
}

function originMatches(origin, allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  return list.filter(Boolean).some((candidate) => String(candidate).replace(/\/$/, '') === String(origin).replace(/\/$/, ''));
}

function verifyRegistration(options) {
  const {
    attestationObject,
    clientDataJSON,
    expectedChallenge,
    expectedOrigin,
    rpId,
    requireUserVerification,
  } = options;

  const clientData = parseClientData(clientDataJSON);
  if (clientData.type !== 'webauthn.create') throw new Error('clientData type must be webauthn.create');
  if (clientData.challenge !== expectedChallenge) throw new Error('Challenge mismatch');
  if (!originMatches(clientData.origin, expectedOrigin)) throw new Error('Origin mismatch: ' + clientData.origin);

  const attestation = cborDecode(fromB64url(attestationObject)).value;
  if (!attestation || !attestation.authData) throw new Error('attestationObject has no authData');

  const auth = parseAuthData(Buffer.from(attestation.authData));
  const expectedRpIdHash = crypto.createHash('sha256').update(String(rpId)).digest();
  if (!crypto.timingSafeEqual(auth.rpIdHash, expectedRpIdHash)) throw new Error('rpIdHash does not match ' + rpId);
  if (!auth.userPresent) throw new Error('User Presence flag was not set');
  if (requireUserVerification && !auth.userVerified) throw new Error('User Verification was required but not performed');
  if (!auth.credentialId || !auth.coseKey) throw new Error('authenticatorData has no attested credential');

  return {
    verified: true,
    fmt: attestation.fmt || 'none',
    credentialId: toB64url(auth.credentialId),
    publicKeyJwk: coseToJwk(auth.coseKey),
    signCount: auth.counter,
    userVerified: auth.userVerified,
    aaguid: auth.aaguid ? toB64url(auth.aaguid) : null,
  };
}

function verifyAssertion(options) {
  const {
    authenticatorData,
    clientDataJSON,
    signature,
    publicKeyJwk,
    expectedChallenge,
    expectedOrigin,
    rpId,
    storedSignCount,
    requireUserVerification,
  } = options;

  const clientData = parseClientData(clientDataJSON);
  if (clientData.type !== 'webauthn.get') throw new Error('clientData type must be webauthn.get');
  if (clientData.challenge !== expectedChallenge) throw new Error('Challenge mismatch');
  if (!originMatches(clientData.origin, expectedOrigin)) throw new Error('Origin mismatch: ' + clientData.origin);

  const authBuffer = fromB64url(authenticatorData);
  const auth = parseAuthData(authBuffer);
  const expectedRpIdHash = crypto.createHash('sha256').update(String(rpId)).digest();
  if (!crypto.timingSafeEqual(auth.rpIdHash, expectedRpIdHash)) throw new Error('rpIdHash does not match ' + rpId);
  if (!auth.userPresent) throw new Error('User Presence flag was not set');
  if (requireUserVerification && !auth.userVerified) throw new Error('User Verification was required but not performed');

  const clientHash = crypto.createHash('sha256').update(fromB64url(clientDataJSON)).digest();
  const signedData = Buffer.concat([authBuffer, clientHash]);

  const key = crypto.createPublicKey({ key: publicKeyJwk, format: 'jwk' });
  const valid = crypto.verify('sha256', signedData, key, fromB64url(signature));
  if (!valid) throw new Error('Signature verification failed');

  if (typeof storedSignCount === 'number' && auth.counter !== 0 && storedSignCount !== 0 && auth.counter <= storedSignCount) {
    // A counter that does not advance can mean a cloned authenticator.
    const err = new Error('Authenticator counter did not increase — the credential may be cloned.');
    err.code = 'WEBAUTHN_COUNTER_REGRESSION';
    throw err;
  }

  return {
    verified: true,
    newSignCount: auth.counter,
    userVerified: auth.userVerified,
  };
}

/* ------------------------------------------------------------- helpers */

function challenge() {
  return toB64url(crypto.randomBytes(32));
}

const ALGORITHMS = [-7, -257];

module.exports = {
  toB64url,
  fromB64url,
  cborDecode,
  parseAuthData,
  coseToJwk,
  parseClientData,
  verifyRegistration,
  verifyAssertion,
  challenge,
  ALGORITHMS,
};
