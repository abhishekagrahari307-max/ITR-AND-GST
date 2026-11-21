/* TaxMitra server – authentication.

   Passwords: scrypt with a per-user salt, constant-time comparison.
   Tokens:    compact HS256 JWTs signed with JWT_SECRET, plus a server-side
              session row so a token can be revoked (logout, password change).
   Nothing here trusts the client about who it is. */

'use strict';

const crypto = require('node:crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password).normalize('NFKC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return 'scrypt$' + SCRYPT.N + '$' + SCRYPT.r + '$' + SCRYPT.p + '$' + salt.toString('base64') + '$' + derived.toString('base64');
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    const actual = crypto.scryptSync(String(password).normalize('NFKC'), salt, expected.length, { N, r, p });
    return crypto.timingSafeEqual(expected, actual);
  } catch (e) {
    return false;
  }
}

function signToken(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = header + '.' + body;
  const sig = b64url(crypto.createHmac('sha256', secret).update(data).digest());
  return data + '.' + sig;
}

function verifyToken(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = parts[0] + '.' + parts[1];
  const expected = crypto.createHmac('sha256', secret).update(data).digest();
  let given;
  try {
    given = fromB64url(parts[2]);
  } catch (e) {
    return null;
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(fromB64url(parts[1]).toString('utf8'));
  } catch (e) {
    return null;
  }
  if (typeof payload !== 'object' || !payload) return null;
  if (payload.exp && Date.now() >= payload.exp * 1000) return null;
  return payload;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateRegistration(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim().slice(0, 80);
  if (!EMAIL_RE.test(email) || email.length > 190) {
    return { error: 'Enter a valid email address.' };
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }
  if (password.length > 200) {
    return { error: 'Password is too long (max 200 characters).' };
  }
  if (/^(password|12345678|qwertyui|taxmitra)$/i.test(password)) {
    return { error: 'That password is too easy to guess. Choose something unique.' };
  }
  return { email, password, name };
}

function issueToken(user, secret, sessionDays, userAgent, store) {
  const jti = crypto.randomUUID();
  const createdAt = Date.now();
  const expiresAt = createdAt + sessionDays * 24 * 60 * 60 * 1000;
  store.createSession({ jti, userId: user.id, createdAt, expiresAt, userAgent: String(userAgent || '').slice(0, 200) });
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    jti,
    iat: Math.floor(createdAt / 1000),
    exp: Math.floor(expiresAt / 1000),
  };
  return { token: signToken(payload, secret), expiresAt, payload };
}

function bearer(req) {
  const header = String(req.headers.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

/* Returns { user, payload } or null. Checks the signature, the expiry and the
   server-side session row (revoked / expired). */
function authenticate(req, cfg, store) {
  const token = bearer(req);
  if (!token) return null;
  const payload = verifyToken(token, cfg.jwtSecret);
  if (!payload || !payload.jti || !payload.sub) return null;
  const session = store.getSession(payload.jti);
  if (!session) return null;
  if (Number(session.revoked) === 1) return null;
  if (Number(session.expires_at) <= Date.now()) return null;
  if (session.user_id !== payload.sub) return null;
  const user = store.findUserById(payload.sub);
  if (!user) return null;
  return { user, payload, token };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  validateRegistration,
  issueToken,
  authenticate,
  bearer,
  EMAIL_RE,
};
