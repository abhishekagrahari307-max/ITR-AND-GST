#!/usr/bin/env node
/* ============================================================
   TaxMitra server
   One process, no dependencies: static site + real accounts +
   per-user cloud sync + AI proxy + government adapters.

   Start:   node server/index.js
   Env:     see .env.example (or server/README section in BACKEND_SETUP.md)
   ============================================================ */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const configLib = require('./lib/config');
const storeLib = require('./lib/store');
const auth = require('./lib/auth');
const AI = require('./lib/ai');
const govt = require('./lib/govt');
const otp = require('./lib/otp');
const emailLib = require('./lib/email');
const oauthLib = require('./lib/oauth');
const accountLib = require('./lib/account');
const adminLib = require('./lib/admin');
const { HttpError, sendJson, sendNoContent, readJson, applyCors, createLimiter, clientIp } = require('./lib/http');

const cfg = configLib.load(process.env);

/* ------------------------------------------------------------ bootstrap */

if (cfg.isProd && !cfg.jwtSecret) {
  console.error('[fatal] JWT_SECRET must be set in production. Generate one with: openssl rand -hex 32');
  process.exit(1);
}
if (!cfg.jwtSecret) {
  cfg.jwtSecret = crypto.randomBytes(32).toString('hex');
}

const ROOT = path.resolve(cfg.rootDir);
const store = storeLib.open(path.resolve(cfg.dataDir));
const limiter = createLimiter();

for (const warning of configLib.warnings(cfg)) console.warn('[config] ' + warning);
console.log('[store] driver=' + store.driver + ' data=' + path.resolve(cfg.dataDir));

/* ------------------------------------------------------------- helpers */

function publicUser(user) {
  return storeLib.publicUser(user);
}

function requireAuth(req) {
  const session = auth.authenticate(req, cfg, store);
  if (!session) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to use this endpoint.');
  return session;
}

function limitOrThrow(key, max, windowMs, code) {
  const result = limiter.hit(key, max, windowMs);
  if (!result.allowed) {
    const err = new HttpError(429, code || 'RATE_LIMITED', 'Too many requests. Try again in ' + result.retryAfter + ' seconds.');
    err.retryAfter = result.retryAfter;
    throw err;
  }
  return result;
}

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

function validDocKey(key) {
  return KEY_RE.test(String(key || ''));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------- routes */

const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, (m) => {
    keys.push(m.slice(1));
    return '([^/]+)';
  }) + '$');
  routes.push({ method, regex, keys, handler });
}

/* ---- health & capability discovery (public) ---- */

route('GET', '/api/health', async (req, res) => {
  sendJson(res, 200, {
    ok: true,
    service: 'taxmitra',
    version: require('../package.json').version,
    time: new Date().toISOString(),
    storage: store.driver,
    capabilities: {
      accounts: true,
      cloudSync: true,
      ai: AI.providerStatus(cfg).length > 0,
      aiProviders: AI.providerStatus(cfg).map((p) => p.id),
      govt: govt.isConfigured(cfg),
      itrFiling: false,
      email: emailLib.isConfigured(cfg),
      oauthProviders: oauthLib.enabledProviders(cfg).map((p) => p.id),
      twoFactor: true,
      passkeys: true,
      twoFactorRecovery: true,
    },
    limits: {
      aiPerHourPerIp: cfg.ai.perHourPerIp,
      aiPerDayGlobal: cfg.ai.perDayGlobal,
      maxDocBytes: cfg.maxDocBytes,
      maxUserBytes: cfg.maxUserBytes,
    },
  });
});

/* ---- auth ---- */

route('POST', '/api/auth/register', async (req, res) => {
  const ip = clientIp(req, cfg.trustProxy);
  limitOrThrow('register:' + ip, cfg.limits.registerPerHour, 60 * 60 * 1000);
  const body = await readJson(req, 64 * 1024);
  const checked = auth.validateRegistration(body);
  if (checked.error) throw new HttpError(400, 'INVALID_INPUT', checked.error);

  if (store.findUserByEmail(checked.email)) {
    throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Sign in instead.');
  }

  const user = store.createUser({
    id: crypto.randomUUID(),
    email: checked.email,
    name: checked.name,
    passwordHash: auth.hashPassword(checked.password),
    role: cfg.adminEmails.includes(checked.email) ? 'admin' : 'user',
    createdAt: Date.now(),
  });

  const issued = auth.issueToken(user, cfg.jwtSecret, cfg.sessionDays, req.headers['user-agent'], store);
  store.touchLogin(user.id);
  store.audit(user.id, 'auth.register', { ip });
  const verification = await account.sendVerificationMail(user, req);
  sendJson(res, 201, {
    token: issued.token,
    expiresAt: issued.expiresAt,
    user: publicUser(store.findUserById(user.id)),
    email: {
      configured: emailLib.isConfigured(cfg),
      sent: verification.sent,
      reason: verification.reason || null,
    },
  });
});

route('POST', '/api/auth/login', async (req, res) => {
  const ip = clientIp(req, cfg.trustProxy);
  limitOrThrow('login:' + ip, cfg.limits.loginPer15Min, 15 * 60 * 1000, 'LOGIN_RATE_LIMITED');
  const body = await readJson(req, 64 * 1024);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) throw new HttpError(400, 'INVALID_INPUT', 'Email and password are required.');

  const user = store.findUserByEmail(email);
  // Always hash something so a missing account and a wrong password take the
  // same time and return the same message.
  const ok = user ? auth.verifyPassword(password, user.password_hash) : auth.verifyPassword(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64'));
  if (!user || !ok) {
    if (user) store.audit(user.id, 'auth.login_failed', { ip });
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  if (Number(user.totp_enabled) === 1) {
    limitOrThrow('2fa-login:' + user.id, 10, 15 * 60 * 1000, 'TOTP_RATE_LIMITED');
    if (!body.totp && !body.backupCode) {
      throw new HttpError(401, 'TOTP_REQUIRED', 'This account has two-factor enabled. Send the 6-digit code in "totp" (or a "backupCode").');
    }
    if (!account.checkSecondFactor(user, body)) {
      store.audit(user.id, 'auth.2fa_failed', { ip });
      throw new HttpError(401, 'TOTP_INVALID', 'That code is not valid. Try the current code from your authenticator app.');
    }
  }

  const issued = auth.issueToken(user, cfg.jwtSecret, cfg.sessionDays, req.headers['user-agent'], store);
  store.touchLogin(user.id);
  store.audit(user.id, 'auth.login', { ip });
  sendJson(res, 200, {
    token: issued.token,
    expiresAt: issued.expiresAt,
    user: publicUser(store.findUserById(user.id)),
  });
});

route('POST', '/api/auth/logout', async (req, res) => {
  const session = requireAuth(req);
  store.revokeSession(session.payload.jti);
  store.audit(session.user.id, 'auth.logout', {});
  sendJson(res, 200, { ok: true });
});

route('GET', '/api/auth/me', async (req, res) => {
  const session = requireAuth(req);
  const docs = store.listDocs(session.user.id);
  sendJson(res, 200, {
    user: publicUser(store.findUserById(session.user.id)),
    session: { expiresAt: session.payload.exp * 1000 },
    storage: { documents: docs.length, bytes: store.userBytes(session.user.id), quota: cfg.maxUserBytes },
    identities: store.identitiesFor(session.user.id).map((i) => ({ provider: i.provider, email: i.email })),
    security: {
      emailVerified: Number(session.user.email_verified) === 1,
      twoFactor: Number(session.user.totp_enabled) === 1,
      emailConfigured: emailLib.isConfigured(cfg),
      oauthProviders: oauthLib.enabledProviders(cfg).map((p) => p.id),
    },
  });
});

route('POST', '/api/auth/password', async (req, res) => {
  const session = requireAuth(req);
  limitOrThrow('pw:' + session.user.id, 5, 60 * 60 * 1000);
  const body = await readJson(req, 16 * 1024);
  const current = String(body.currentPassword || '');
  const next = String(body.newPassword || '');
  if (!auth.verifyPassword(current, session.user.password_hash)) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Your current password is incorrect.');
  }
  const checked = auth.validateRegistration({ email: session.user.email, password: next });
  if (checked.error) throw new HttpError(400, 'INVALID_INPUT', checked.error);
  store.setPassword(session.user.id, auth.hashPassword(next));
  store.revokeAllSessions(session.user.id);
  store.audit(session.user.id, 'auth.password_changed', {});
  sendJson(res, 200, { ok: true, message: 'Password changed. Every other session was signed out.' });
});

/* ---- cloud sync ---- */

route('GET', '/api/sync', async (req, res) => {
  const session = requireAuth(req);
  sendJson(res, 200, {
    documents: store.listDocs(session.user.id),
    bytes: store.userBytes(session.user.id),
    quota: cfg.maxUserBytes,
  });
});

/* Everything in one call, so a browser can reconcile in a single round trip. */
route('GET', '/api/sync/all', async (req, res) => {
  const session = requireAuth(req);
  const documents = store.listDocs(session.user.id).map((entry) => {
    const doc = store.getDoc(session.user.id, entry.key);
    let value = null;
    try { value = JSON.parse(doc.value); } catch (e) { value = null; }
    return { key: doc.key, value, updatedAt: doc.updated_at, version: doc.version };
  });
  sendJson(res, 200, { documents, bytes: store.userBytes(session.user.id), quota: cfg.maxUserBytes });
});

route('GET', '/api/sync/doc/:key', async (req, res, params) => {
  const session = requireAuth(req);
  if (!validDocKey(params.key)) throw new HttpError(400, 'INVALID_KEY', 'Document keys may only contain letters, digits, dot, dash, underscore and colon.');
  const doc = store.getDoc(session.user.id, params.key);
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'No such document.');
  sendJson(res, 200, { key: doc.key, value: JSON.parse(doc.value), updatedAt: doc.updated_at, version: doc.version });
});

route('PUT', '/api/sync/doc/:key', async (req, res, params) => {
  const session = requireAuth(req);
  if (!validDocKey(params.key)) throw new HttpError(400, 'INVALID_KEY', 'Invalid document key.');
  const body = await readJson(req, cfg.maxBodyBytes);
  if (!('value' in body)) throw new HttpError(400, 'INVALID_INPUT', 'Body must be {"value": ...}.');
  const serialised = JSON.stringify(body.value);
  if (serialised === undefined) throw new HttpError(400, 'INVALID_INPUT', 'value must be JSON serialisable.');
  const size = Buffer.byteLength(serialised);
  if (size > cfg.maxDocBytes) throw new HttpError(413, 'DOC_TOO_LARGE', 'A single document may not exceed ' + cfg.maxDocBytes + ' bytes.');
  const used = store.userBytes(session.user.id);
  const existing = store.getDoc(session.user.id, params.key);
  const projected = used - (existing ? Buffer.byteLength(existing.value) : 0) + size;
  if (projected > cfg.maxUserBytes) throw new HttpError(413, 'QUOTA_EXCEEDED', 'This account has used its ' + cfg.maxUserBytes + '-byte cloud quota.');

  const doc = store.putDoc(session.user.id, params.key, serialised, Number(body.updatedAt) || Date.now());
  sendJson(res, 200, { key: doc.key, updatedAt: doc.updated_at, version: doc.version, bytes: size });
});

route('DELETE', '/api/sync/doc/:key', async (req, res, params) => {
  const session = requireAuth(req);
  if (!validDocKey(params.key)) throw new HttpError(400, 'INVALID_KEY', 'Invalid document key.');
  store.deleteDoc(session.user.id, params.key);
  sendJson(res, 200, { ok: true });
});

route('POST', '/api/sync/bulk', async (req, res) => {
  const session = requireAuth(req);
  const body = await readJson(req, cfg.maxBodyBytes);
  if (!Array.isArray(body.docs)) throw new HttpError(400, 'INVALID_INPUT', 'Body must be {"docs":[{"key","value","updatedAt"}]}.');

  const used = store.userBytes(session.user.id);
  let projected = used;
  const applied = [];
  const rejected = [];

  for (const entry of body.docs.slice(0, 200)) {
    if (!entry || !validDocKey(entry.key)) { rejected.push({ key: entry && entry.key, reason: 'invalid key' }); continue; }
    if (!('value' in entry)) { rejected.push({ key: entry.key, reason: 'missing value' }); continue; }
    const serialised = JSON.stringify(entry.value);
    if (serialised === undefined) { rejected.push({ key: entry.key, reason: 'not serialisable' }); continue; }
    const size = Buffer.byteLength(serialised);
    if (size > cfg.maxDocBytes) { rejected.push({ key: entry.key, reason: 'document too large' }); continue; }
    const existing = store.getDoc(session.user.id, entry.key);
    projected = projected - (existing ? Buffer.byteLength(existing.value) : 0) + size;
    if (projected > cfg.maxUserBytes) { rejected.push({ key: entry.key, reason: 'quota exceeded' }); continue; }
    const doc = store.putDoc(session.user.id, entry.key, serialised, Number(entry.updatedAt) || Date.now());
    applied.push({ key: doc.key, updatedAt: doc.updated_at, version: doc.version });
  }

  sendJson(res, 200, {
    applied: applied.length,
    documents: applied,
    rejected,
    bytes: store.userBytes(session.user.id),
    quota: cfg.maxUserBytes,
  });
});

/* ---- AI ---- */

route('GET', '/api/ai/status', async (req, res) => {
  const providers = AI.providerStatus(cfg);
  sendJson(res, 200, {
    configured: providers.length > 0,
    providers,
    limits: { perHourPerIp: cfg.ai.perHourPerIp, perDayGlobal: cfg.ai.perDayGlobal },
    note: providers.length
      ? 'Keys live on the server. Visitors do not need their own key.'
      : 'No provider key is set. The site keeps working with its local rule engine, clearly labelled as rule-based.',
  });
});

/* Pass-through used by js/ai-proxy-config.js (same contract as the old worker). */
route('POST', '/api/ai', async (req, res) => {
  const ip = clientIp(req, cfg.trustProxy);
  limitOrThrow('ai:' + ip, cfg.ai.perHourPerIp, 60 * 60 * 1000, 'AI_RATE_LIMITED');
  const day = today();
  const usage = store.bumpAi(day, ip);
  if (usage.global > cfg.ai.perDayGlobal) {
    throw new HttpError(429, 'AI_DAILY_LIMIT', 'The shared daily AI quota is exhausted. Try again tomorrow.');
  }

  const body = await readJson(req, cfg.maxBodyBytes);
  const model = AI.normaliseModelName(req.headers['x-taxmitra-model']) || 'gemini';

  if (model === 'gemini') {
    if (!cfg.ai.geminiKey) {
      throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Gemini is not configured on this server. The site will use its offline rule engine.');
    }
    const result = await AI.geminiPassThrough(cfg, body);
    sendJson(res, result.status, result.data);
    return;
  }
  if (model === 'openrouter') {
    if (!cfg.ai.openrouterKey) {
      throw new HttpError(503, 'AI_NOT_CONFIGURED', 'OpenRouter is not configured on this server.');
    }
    // The browser sends an OpenAI-shaped body; forward it untouched.
    const result = await AI.openRouterPassThrough(cfg, body);
    sendJson(res, result.status, result.data);
    return;
  }
  throw new HttpError(400, 'UNKNOWN_MODEL', 'X-TaxMitra-Model must be gemini or openrouter on this endpoint.');
});

route('POST', '/api/ai/chat', async (req, res) => {
  const ip = clientIp(req, cfg.trustProxy);
  limitOrThrow('ai:' + ip, cfg.ai.perHourPerIp, 60 * 60 * 1000, 'AI_RATE_LIMITED');
  const usage = store.bumpAi(today(), ip);
  if (usage.global > cfg.ai.perDayGlobal) {
    throw new HttpError(429, 'AI_DAILY_LIMIT', 'The shared daily AI quota is exhausted. Try again tomorrow.');
  }
  const body = await readJson(req, cfg.maxBodyBytes);
  const messages = AI.sanitiseMessages(body.messages);
  if (!messages.length) throw new HttpError(400, 'INVALID_INPUT', 'Send messages: [{role:"user",content:"…"}].');
  const answer = await AI.chat(cfg, messages);
  sendJson(res, 200, {
    text: answer.text,
    provider: answer.provider,
    model: answer.model,
    usage: { ipCallsToday: usage.ip, globalCallsToday: usage.global },
  });
});

/* ---- government adapters ---- */

route('GET', '/api/govt/status', async (req, res) => {
  sendJson(res, 200, govt.status(cfg));
});

route('POST', '/api/govt/einvoice/irn', async (req, res) => {
  const session = requireAuth(req);
  limitOrThrow('govt:' + session.user.id, 30, 60 * 60 * 1000);
  const body = await readJson(req, cfg.maxBodyBytes);
  const result = await govt.generateIrn(cfg, body.invoice || body);
  store.audit(session.user.id, 'govt.einvoice.irn', { ok: true });
  sendJson(res, 200, result);
});

route('POST', '/api/govt/gst-return', async (req, res) => {
  const session = requireAuth(req);
  limitOrThrow('govt:' + session.user.id, 20, 60 * 60 * 1000);
  const body = await readJson(req, cfg.maxBodyBytes);
  const result = await govt.fileGstReturn(cfg, { returnType: body.returnType, payload: body.payload });
  store.audit(session.user.id, 'govt.gst_return', { returnType: body.returnType, ok: true });
  sendJson(res, 200, result);
});

route('POST', '/api/govt/itr', async (req, res) => {
  requireAuth(req);
  throw govt.itrUnavailable();
});

/* ---- admin (server/lib/admin.js) ---- */

/* ---- account lifecycle: verification, reset, 2FA, OAuth, sessions ---- */

const account = accountLib.install(route, {
  cfg,
  store,
  auth,
  otp,
  emailLib,
  oauthLib,
  HttpError,
  sendJson,
  readJson,
  limitOrThrow,
  publicUser,
  clientIp,
  requireAuth,
});

adminLib.install(route, {
  cfg,
  store,
  auth,
  otp,
  emailLib,
  HttpError,
  sendJson,
  readJson,
  limitOrThrow,
  publicUser,
  clientIp,
  requireAuth,
});

// Housekeeping: expired tokens and OAuth states are useless, so drop them hourly.
setInterval(() => {
  try { store.purgeExpiredTokens(); } catch (e) { /* housekeeping must never crash the server */ }
}, 60 * 60 * 1000).unref();

/* ------------------------------------------------------------- static */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf',
};

const BLOCKED = new Set(['.git', 'node_modules', 'server', 'data', '.github', '.arena', 'coverage', 'tmp']);

function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (e) {
    throw new HttpError(400, 'BAD_PATH', 'Malformed URL.');
  }
  if (decoded.includes('\0')) throw new HttpError(400, 'BAD_PATH', 'Malformed URL.');

  const rel = decoded.replace(/^\/+/, '');
  const target = path.resolve(ROOT, rel === '' ? 'index.html' : rel);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    throw new HttpError(403, 'FORBIDDEN', 'Outside the web root.');
  }
  const relative = path.relative(ROOT, target);
  const firstSegment = relative.split(path.sep)[0];
  if (BLOCKED.has(firstSegment) || relative.split(path.sep).some((p) => p.startsWith('.'))) {
    throw new HttpError(404, 'NOT_FOUND', 'Not found.');
  }

  let file = target;
  let stat;
  try {
    stat = fs.statSync(file);
    if (stat.isDirectory()) {
      file = path.join(file, 'index.html');
      stat = fs.statSync(file);
    }
  } catch (e) {
    throw new HttpError(404, 'NOT_FOUND', 'Not found.');
  }

  const ext = path.extname(file).toLowerCase();
  const etag = '"' + stat.size.toString(16) + '-' + Math.floor(stat.mtimeMs).toString(16) + '"';
  if (req.headers['if-none-match'] === etag) {
    sendNoContent(res, 304);
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(self), camera=()',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}

/* --------------------------------------------------------------- server */

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let pathname = '/';
  try {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    pathname = url.pathname;

    applyCors(req, res, cfg.allowedOrigins);
    if (req.method === 'OPTIONS') { sendNoContent(res, 204); return; }

    // Same-origin request guard for state-changing API calls. Bearer tokens are
    // not sent by browsers automatically, so CSRF is already limited; this also
    // blocks a form post from another site.
    if (pathname.startsWith('/api/') && req.method !== 'GET' && req.headers.origin) {
      const same = (() => { try { return new URL(req.headers.origin).host === req.headers.host; } catch (e) { return false; } })();
      if (!same && !cfg.allowedOrigins.includes(req.headers.origin)) {
        throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed to call the TaxMitra API.');
      }
    }

    if (pathname.startsWith('/api/')) {
      limitOrThrow('api:' + clientIp(req, cfg.trustProxy), cfg.limits.apiPerMinute, 60 * 1000);
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const match = r.regex.exec(pathname);
        if (!match) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(match[i + 1]); });
        await r.handler(req, res, params, url);
        return;
      }
      throw new HttpError(404, 'NO_ROUTE', 'No such API endpoint.');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only GET and HEAD are served for pages.');
    }
    serveStatic(req, res, pathname);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : (error && error.status) || 500;
    const code = error instanceof HttpError ? error.code : (error && error.code) || 'INTERNAL_ERROR';
    const message = status >= 500 && code === 'INTERNAL_ERROR'
      ? 'Something went wrong on the server. The details are in the server log.'
      : String(error && error.message ? error.message : 'Request failed');
    if (status >= 500) console.error('[api]', req.method, pathname, code, error && error.stack ? error.stack.split('\n')[0] : message);
    if (!res.headersSent) {
      const headers = {};
      if (error && error.retryAfter) headers['Retry-After'] = String(error.retryAfter);
      sendJson(res, status, {
        error: message,
        code,
        ...(error && error.upstream ? { upstream: error.upstream } : {}),
      }, headers);
    } else {
      res.end();
    }
  } finally {
    if (process.env.LOG_REQUESTS === '1') {
      console.log('[req]', req.method, pathname, res.statusCode, (Date.now() - started) + 'ms');
    }
  }
});

server.headersTimeout = 20000;
server.requestTimeout = 60000;

function shutdown(signal) {
  console.log('[server] ' + signal + ' received, shutting down');
  server.close(() => {
    try { store.close(); } catch (e) { /* ignore */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) {
  server.listen(cfg.port, cfg.host, () => {
    console.log('⚡ TaxMitra server on http://' + cfg.host + ':' + cfg.port);
    console.log('   health: /api/health · AI: ' + (AI.providerStatus(cfg).length ? AI.providerStatus(cfg).map((p) => p.id).join(', ') : 'rule-engine only (no key)'));
    console.log('   government adapters: ' + (govt.isConfigured(cfg) ? 'configured' : 'not configured (honest 501)'));
  });
}

module.exports = { server, cfg, store };
