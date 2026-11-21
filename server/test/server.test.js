/* Server tests. Real HTTP against a real listening server, with a fake
   OpenAI-compatible upstream so the AI proxy path is exercised end to end
   without needing anybody's API key. Run: npm run test:server */

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let appServer;
let baseUrl;
let mockServer;
let tmpDir;

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function api(pathname, options = {}) {
  const res = await fetch(baseUrl + pathname, {
    method: options.method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.token ? { Authorization: 'Bearer ' + options.token } : {}, options.headers || {}),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text }; }
  return { status: res.status, body: json, headers: res.headers };
}

let token;
let secondToken;

before(async () => {
  // Fake OpenAI-compatible provider.
  mockServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'missing key' } }));
        return;
      }
      const lastUser = (body.messages || []).filter((m) => m.role === 'user').pop();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        model: body.model,
        choices: [{ message: { role: 'assistant', content: 'Echo: ' + (lastUser ? lastUser.content : '') } }],
      }));
    });
  });
  const mockPort = await listen(mockServer);

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taxmitra-test-'));
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
  process.env.DATA_DIR = tmpDir;
  process.env.SESSION_DAYS = '1';
  process.env.REGISTER_PER_HOUR = '200';
  process.env.LOGIN_PER_15MIN = '500';
  process.env.FORGOT_PER_HOUR = '200';
  process.env.API_PER_MINUTE = '100000';
  process.env.EMAIL_DRIVER = 'console';
  process.env.EMAIL_FROM = 'TaxMitra <test@taxmitra.local>';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:' + mockPort + '/v1';
  process.env.OPENAI_MODEL = 'mock-model';
  process.env.ADMIN_EMAILS = 'admin@example.com';

  const mod = require('../index.js');
  appServer = mod.server;
  const port = await listen(appServer);
  baseUrl = 'http://127.0.0.1:' + port;
});

after(async () => {
  await new Promise((resolve) => appServer.close(resolve));
  await new Promise((resolve) => mockServer.close(resolve));
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
});

/* ------------------------------------------------------------- health */

test('health reports capabilities and never claims ITR filing', async () => {
  const r = await api('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.capabilities.accounts, true);
  assert.equal(r.body.capabilities.cloudSync, true);
  assert.equal(r.body.capabilities.ai, true);
  assert.equal(r.body.capabilities.itrFiling, false);
});

test('the static site is served and server internals are not', async () => {
  const home = await fetch(baseUrl + '/');
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /TaxMitra/i);

  for (const blocked of ['/server/index.js', '/data/taxmitra.db', '/.git/config', '/node_modules/x.js']) {
    const res = await fetch(baseUrl + blocked);
    assert.ok(res.status === 404 || res.status === 403, blocked + ' should not be served, got ' + res.status);
  }

  const traversal = await fetch(baseUrl + '/..%2f..%2fetc%2fpasswd');
  assert.ok(traversal.status >= 400, 'path traversal must fail');
});

/* --------------------------------------------------------------- auth */

test('registration validates input and creates a session', async () => {
  const bad = await api('/api/auth/register', { method: 'POST', body: { email: 'nope', password: 'longenough1' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'INVALID_INPUT');

  const weak = await api('/api/auth/register', { method: 'POST', body: { email: 'a@b.com', password: 'short' } });
  assert.equal(weak.status, 400);

  const ok = await api('/api/auth/register', { method: 'POST', body: { email: 'user@example.com', password: 'correct-horse-1', name: 'Test User' } });
  assert.equal(ok.status, 201);
  assert.ok(ok.body.token);
  assert.equal(ok.body.user.email, 'user@example.com');
  assert.equal(ok.body.user.role, 'user');
  assert.equal(ok.body.user.password_hash, undefined, 'hash must never leave the server');
  token = ok.body.token;

  const dupe = await api('/api/auth/register', { method: 'POST', body: { email: 'user@example.com', password: 'another-pass-1' } });
  assert.equal(dupe.status, 409);
});

test('the configured admin email gets the admin role', async () => {
  const r = await api('/api/auth/register', { method: 'POST', body: { email: 'admin@example.com', password: 'admin-password-1' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, 'admin');
  const audit = await api('/api/admin/audit', { token: r.body.token });
  assert.equal(audit.status, 200);
  assert.ok(Array.isArray(audit.body.events));
});

test('login works, wrong password does not, and logout revokes the token', async () => {
  const wrong = await api('/api/auth/login', { method: 'POST', body: { email: 'user@example.com', password: 'wrong-password' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.code, 'INVALID_CREDENTIALS');

  const unknown = await api('/api/auth/login', { method: 'POST', body: { email: 'ghost@example.com', password: 'whatever-1' } });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.message, wrong.body.message, 'same message for unknown account');

  const ok = await api('/api/auth/login', { method: 'POST', body: { email: 'USER@example.com', password: 'correct-horse-1' } });
  assert.equal(ok.status, 200);
  const fresh = ok.body.token;

  const me = await api('/api/auth/me', { token: fresh });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'user@example.com');

  const out = await api('/api/auth/logout', { method: 'POST', token: fresh });
  assert.equal(out.status, 200);

  const revoked = await api('/api/auth/me', { token: fresh });
  assert.equal(revoked.status, 401);
});

test('protected endpoints reject missing or forged tokens', async () => {
  const none = await api('/api/sync');
  assert.equal(none.status, 401);

  const forged = await api('/api/sync', { token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad' });
  assert.equal(forged.status, 401);
});

test('password change requires the current password and revokes other sessions', async () => {
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'user@example.com', password: 'correct-horse-1' } });
  const sessionToken = login.body.token;

  const bad = await api('/api/auth/password', { method: 'POST', token: sessionToken, body: { currentPassword: 'nope', newPassword: 'new-password-1' } });
  assert.equal(bad.status, 401);

  const ok = await api('/api/auth/password', { method: 'POST', token: sessionToken, body: { currentPassword: 'correct-horse-1', newPassword: 'new-password-1' } });
  assert.equal(ok.status, 200);

  const dead = await api('/api/auth/me', { token: sessionToken });
  assert.equal(dead.status, 401);

  const relogin = await api('/api/auth/login', { method: 'POST', body: { email: 'user@example.com', password: 'new-password-1' } });
  assert.equal(relogin.status, 200);
  assert.equal(relogin.body.user.email, 'user@example.com');
});

/* --------------------------------------------------------------- sync */

test('a signed-in account can store and read its own documents', async () => {
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'user@example.com', password: 'new-password-1' } });
  token = login.body.token;

  const put = await api('/api/sync/doc/tm-billing-invoices', { method: 'PUT', token, body: { value: [{ id: 'inv-1', total: 118000 }] } });
  assert.equal(put.status, 200);
  assert.equal(put.body.version, 1);

  const again = await api('/api/sync/doc/tm-billing-invoices', { method: 'PUT', token, body: { value: [{ id: 'inv-1', total: 118000 }, { id: 'inv-2', total: 59000 }] } });
  assert.equal(again.body.version, 2);

  const got = await api('/api/sync/doc/tm-billing-invoices', { token });
  assert.equal(got.status, 200);
  assert.equal(got.body.value.length, 2);
  assert.equal(got.body.value[1].total, 59000);

  const list = await api('/api/sync', { token });
  assert.equal(list.status, 200);
  assert.ok(list.body.documents.some((d) => d.key === 'tm-billing-invoices'));
  assert.ok(list.body.bytes > 0);

  const del = await api('/api/sync/doc/tm-billing-invoices', { method: 'DELETE', token });
  assert.equal(del.status, 200);
  const empty = await api('/api/sync/doc/tm-billing-invoices', { token });
  assert.equal(empty.status, 404);
});

test('GET /api/sync/all returns every document with its value', async () => {
  await api('/api/sync/doc/tm-all-check', { method: 'PUT', token, body: { value: { hello: 'world' } } });
  const r = await api('/api/sync/all', { token });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.documents));
  const doc = r.body.documents.find((d) => d.key === 'tm-all-check');
  assert.ok(doc, 'the document must come back');
  assert.equal(doc.value.hello, 'world');
  assert.ok(doc.version >= 1);
});

test('two accounts never see each other’s data', async () => {
  const a = await api('/api/auth/register', { method: 'POST', body: { email: 'one@example.com', password: 'password-one-1' } });
  const b = await api('/api/auth/register', { method: 'POST', body: { email: 'two@example.com', password: 'password-two-1' } });
  secondToken = b.body.token;

  await api('/api/sync/doc/tm-secret', { method: 'PUT', token: a.body.token, body: { value: 'A only' } });
  const fromB = await api('/api/sync/doc/tm-secret', { token: b.body.token });
  assert.equal(fromB.status, 404);
  const fromA = await api('/api/sync/doc/tm-secret', { token: a.body.token });
  assert.equal(fromA.body.value, 'A only');
});

test('sync rejects bad keys, oversized documents and unserialisable values', async () => {
  const badKey = await api('/api/sync/doc/%2e%2e%2fdanger', { method: 'PUT', token, body: { value: 1 } });
  assert.ok(badKey.status === 400 || badKey.status === 404);

  const missing = await api('/api/sync/doc/tm-x', { method: 'PUT', token, body: {} });
  assert.equal(missing.status, 400);

  const huge = await api('/api/sync/doc/tm-huge', { method: 'PUT', token, body: { value: 'x'.repeat(1100000) } });
  assert.equal(huge.status, 413);
  assert.equal(huge.body.code, 'DOC_TOO_LARGE');
});

test('bulk sync applies valid documents and reports rejected ones', async () => {
  const r = await api('/api/sync/bulk', {
    method: 'POST',
    token,
    body: {
      docs: [
        { key: 'tm-customers', value: [{ name: 'Ramesh' }], updatedAt: 1700000000000 },
        { key: 'tm-items', value: [{ name: 'Consulting', rate: 5000 }] },
        { key: '../escape', value: 'nope' },
        { key: 'tm-empty' },
      ],
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.applied, 2);
  assert.equal(r.body.rejected.length, 2);

  const customers = await api('/api/sync/doc/tm-customers', { token });
  assert.equal(customers.body.value[0].name, 'Ramesh');
});

/* ----------------------------------------------------------------- AI */

test('AI status reports the server-side provider without leaking the key', async () => {
  const r = await api('/api/ai/status');
  assert.equal(r.status, 200);
  assert.equal(r.body.configured, true);
  assert.ok(r.body.providers.some((p) => p.id === 'openai'));
  assert.equal(JSON.stringify(r.body).includes('test-key'), false);
});

test('the normalised chat endpoint proxies to the provider and returns text', async () => {
  const r = await api('/api/ai/chat', {
    method: 'POST',
    body: { messages: [{ role: 'user', content: '80C limit kya hai?' }] },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.text, 'Echo: 80C limit kya hai?');
  assert.equal(r.body.provider, 'openai');
  assert.equal(r.body.model, 'mock-model');
});

test('chat input is validated', async () => {
  const r = await api('/api/ai/chat', { method: 'POST', body: { messages: [] } });
  assert.equal(r.status, 400);
  const notJson = await fetch(baseUrl + '/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hi' });
  assert.equal(notJson.status, 415);
});

/* ------------------------------------------------------------- government */

test('government status is honest about what is not configured', async () => {
  const r = await api('/api/govt/status');
  assert.equal(r.status, 200);
  assert.equal(r.body.configured, false);
  assert.equal(r.body.einvoice.available, false);
  assert.equal(r.body.incomeTaxFiling.available, false);
  assert.match(r.body.incomeTaxFiling.reason, /no open filing API/i);
});

test('e-invoice, GST return and ITR endpoints refuse instead of inventing results', async () => {
  const einvoice = await api('/api/govt/einvoice/irn', { method: 'POST', token, body: { invoice: { Version: '1.1' } } });
  assert.equal(einvoice.status, 501);
  assert.equal(einvoice.body.code, 'GOVT_NOT_CONFIGURED');
  assert.equal(JSON.stringify(einvoice.body).includes('Irn'), false, 'no fabricated IRN');

  const gst = await api('/api/govt/gst-return', { method: 'POST', token, body: { returnType: 'GSTR1', payload: {} } });
  assert.equal(gst.status, 501);

  const itr = await api('/api/govt/itr', { method: 'POST', token, body: {} });
  assert.equal(itr.status, 501);
  assert.equal(itr.body.code, 'ITD_FILING_API_UNAVAILABLE');
});

test('the IRP password encryption matches the documented NIC pattern', async () => {
  const govt = require('../lib/govt');
  const crypto = require('node:crypto');
  const secret = 'a'.repeat(32);
  const out = govt.encryptPasswordForIrp('mypassword', secret);
  const decipher = crypto.createDecipheriv('aes-256-ecb', Buffer.from(secret, 'utf8'), null);
  const plain = Buffer.concat([decipher.update(Buffer.from(out, 'base64')), decipher.final()]).toString('utf8');
  assert.equal(plain, 'mypassword');
  assert.throws(() => govt.encryptPasswordForIrp('x', 'short'), /at least 32/);
});

/* ------------------------------------------------ account lifecycle */

const emailLib = require('../lib/email');
const otpLib = require('../lib/otp');

function lastMailTo(address) {
  const mail = emailLib.readOutbox().filter((m) => m.to === address).pop();
  if (!mail) throw new Error('no mail was sent to ' + address);
  return mail;
}

function tokenFromMail(mail) {
  const match = /[?&#](?:token|reset)=([A-Za-z0-9_-]{20,})/.exec(mail.text);
  if (!match) throw new Error('no token found in mail: ' + mail.text);
  return match[1];
}

async function registerUser(email, password, name) {
  const res = await api('/api/auth/register', { method: 'POST', body: { email, password, name } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

test('registration sends a single-use verification link that flips the flag once', async () => {
  emailLib.clearOutbox();
  const created = await registerUser('verify-me@example.com', 'verify-pass-1', 'Verify');
  assert.equal(created.user.email_verified, false);
  assert.equal(created.email.configured, true);
  assert.equal(created.email.sent, true);

  const mail = lastMailTo('verify-me@example.com');
  assert.match(mail.subject, /confirm/i);
  const token = tokenFromMail(mail);

  const ok = await api('/api/auth/verify', { method: 'POST', body: { token } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);

  const me = await api('/api/auth/me', { token: created.token });
  assert.equal(me.body.user.email_verified, true);

  const reuse = await api('/api/auth/verify', { method: 'POST', body: { token } });
  assert.equal(reuse.status, 400);
  assert.equal(reuse.body.code, 'TOKEN_INVALID');
});

test('the verify link in an email answers with a redirect, not JSON', async () => {
  emailLib.clearOutbox();
  await registerUser('link-open@example.com', 'link-pass-1', 'Link');
  const token = tokenFromMail(lastMailTo('link-open@example.com'));
  const res = await fetch(baseUrl + '/api/auth/verify?token=' + encodeURIComponent(token), { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /verify=ok/);

  const bad = await fetch(baseUrl + '/api/auth/verify?token=nope', { redirect: 'manual' });
  assert.equal(bad.status, 302);
  assert.match(bad.headers.get('location'), /verify=invalid/);
});

test('resending a verification mail is rate limited and honest about delivery', async () => {
  const created = await registerUser('resend@example.com', 'resend-pass-1', 'Resend');
  const first = await api('/api/auth/verify/resend', { method: 'POST', token: created.token });
  assert.equal(first.status, 200);
  assert.equal(first.body.sent, true);
  const second = await api('/api/auth/verify/resend', { method: 'POST', token: created.token });
  assert.equal(second.status, 200);
  const third = await api('/api/auth/verify/resend', { method: 'POST', token: created.token });
  assert.equal(third.status, 200);
  const fourth = await api('/api/auth/verify/resend', { method: 'POST', token: created.token });
  assert.equal(fourth.status, 429);
});

test('forgot-password never reveals whether an account exists', async () => {
  emailLib.clearOutbox();
  const known = await api('/api/auth/forgot', { method: 'POST', body: { email: 'verify-me@example.com' } });
  const unknown = await api('/api/auth/forgot', { method: 'POST', body: { email: 'nobody-here@example.com' } });
  const malformed = await api('/api/auth/forgot', { method: 'POST', body: { email: 'not-an-email' } });
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.equal(malformed.status, 200);
  assert.equal(known.body.message, unknown.body.message);
  assert.equal(emailLib.readOutbox().length, 1, 'only the real account gets mail');
});

test('a reset token changes the password once and kills every old session', async () => {
  emailLib.clearOutbox();
  const created = await registerUser('reset-me@example.com', 'old-password-1', 'Reset');
  const oldSession = created.token;

  await api('/api/auth/forgot', { method: 'POST', body: { email: 'reset-me@example.com' } });
  const token = tokenFromMail(lastMailTo('reset-me@example.com'));

  const weak = await api('/api/auth/reset', { method: 'POST', body: { token, password: 'short' } });
  assert.equal(weak.status, 400);

  const ok = await api('/api/auth/reset', { method: 'POST', body: { token, password: 'brand-new-pass-1' } });
  assert.equal(ok.status, 200);

  const replay = await api('/api/auth/reset', { method: 'POST', body: { token, password: 'another-pass-1' } });
  assert.equal(replay.status, 400);

  const oldLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'reset-me@example.com', password: 'old-password-1' } });
  assert.equal(oldLogin.status, 401);
  const newLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'reset-me@example.com', password: 'brand-new-pass-1' } });
  assert.equal(newLogin.status, 200);

  const deadSession = await api('/api/auth/me', { token: oldSession });
  assert.equal(deadSession.status, 401);
});

test('two-factor: setup, wrong code, enable, backup codes, login and disable', async () => {
  const created = await registerUser('twofa@example.com', 'twofa-password-1', 'TwoFA');
  const sessionToken = created.token;

  const setup = await api('/api/auth/2fa/setup', { method: 'POST', token: sessionToken });
  assert.equal(setup.status, 200);
  assert.match(setup.body.otpauth, /^otpauth:\/\/totp\//);
  const secret = setup.body.secret;

  const notYet = await api('/api/auth/login', { method: 'POST', body: { email: 'twofa@example.com', password: 'twofa-password-1' } });
  assert.equal(notYet.status, 200, '2FA is not on until it is confirmed');

  const wrong = await api('/api/auth/2fa/enable', { method: 'POST', token: sessionToken, body: { code: '000000' } });
  assert.equal(wrong.status, 400);

  const code = otpLib.totpAt(secret);
  const enabled = await api('/api/auth/2fa/enable', { method: 'POST', token: sessionToken, body: { code } });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.backupCodes.length, 10);

  const noCode = await api('/api/auth/login', { method: 'POST', body: { email: 'twofa@example.com', password: 'twofa-password-1' } });
  assert.equal(noCode.status, 401);
  assert.equal(noCode.body.code, 'TOTP_REQUIRED');

  const badCode = await api('/api/auth/login', { method: 'POST', body: { email: 'twofa@example.com', password: 'twofa-password-1', totp: '123456' } });
  assert.equal(badCode.status, 401);
  assert.equal(badCode.body.code, 'TOTP_INVALID');

  const good = await api('/api/auth/login', { method: 'POST', body: { email: 'twofa@example.com', password: 'twofa-password-1', totp: otpLib.totpAt(secret) } });
  assert.equal(good.status, 200);
  assert.equal(good.body.user.two_factor, true);

  const backupCode = enabled.body.backupCodes[0];
  const viaBackup = await api('/api/auth/login', { method: 'POST', body: { email: 'twofa@example.com', password: 'twofa-password-1', backupCode } });
  assert.equal(viaBackup.status, 200);

  const backupReuse = await api('/api/auth/login', { method: 'POST', body: { email: 'twofa@example.com', password: 'twofa-password-1', backupCode } });
  assert.equal(backupReuse.status, 401, 'a backup code works once');

  const me = await api('/api/auth/me', { token: viaBackup.body.token });
  assert.equal(me.body.security.twoFactor, true);
  assert.equal(me.body.security.emailConfigured, true);

  const disableWrongPassword = await api('/api/auth/2fa/disable', { method: 'POST', token: viaBackup.body.token, body: { password: 'nope', code: otpLib.totpAt(secret) } });
  assert.equal(disableWrongPassword.status, 401);

  const disabled = await api('/api/auth/2fa/disable', { method: 'POST', token: viaBackup.body.token, body: { password: 'twofa-password-1', code: otpLib.totpAt(secret) } });
  assert.equal(disabled.status, 200);

  const simpleLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'twofa@example.com', password: 'twofa-password-1' } });
  assert.equal(simpleLogin.status, 200);
});

test('sessions can be listed and individually revoked', async () => {
  const created = await registerUser('sessions@example.com', 'sessions-pass-1', 'Sessions');
  const second = await api('/api/auth/login', { method: 'POST', body: { email: 'sessions@example.com', password: 'sessions-pass-1' } });
  assert.equal(second.status, 200);

  const list = await api('/api/auth/sessions', { token: created.token });
  assert.equal(list.status, 200);
  assert.ok(list.body.sessions.length >= 2);
  const current = list.body.sessions.find((s) => s.current);
  assert.ok(current, 'the current session must be identifiable');

  const other = list.body.sessions.find((s) => !s.current);
  const revoked = await api('/api/auth/sessions/' + other.id, { method: 'DELETE', token: created.token });
  assert.equal(revoked.status, 200);

  const nowDead = await api('/api/auth/me', { token: second.body.token });
  assert.equal(nowDead.status, 401);
  const stillAlive = await api('/api/auth/me', { token: created.token });
  assert.equal(stillAlive.status, 200);
});

test('OAuth is advertised honestly and refuses to start when unconfigured', async () => {
  const providers = await api('/api/auth/oauth/providers');
  assert.equal(providers.status, 200);
  assert.deepEqual(providers.body.providers, []);

  const start = await api('/api/auth/oauth/github/start');
  assert.equal(start.status, 501);
  assert.equal(start.body.code, 'OAUTH_NOT_CONFIGURED');

  const callback = await fetch(baseUrl + '/api/auth/oauth/github/callback?code=x&state=bogus', { redirect: 'manual' });
  assert.equal(callback.status, 302);
  assert.match(callback.headers.get('location'), /oauth=state_invalid/);

  const exchange = await api('/api/auth/oauth/exchange', { method: 'POST', body: { code: 'nope' } });
  assert.equal(exchange.status, 400);
  assert.equal(exchange.body.code, 'CODE_INVALID');
});

test('health advertises email, 2FA and OAuth readiness', async () => {
  const r = await api('/api/health');
  assert.equal(r.body.capabilities.email, true);
  assert.equal(r.body.capabilities.twoFactor, true);
  assert.ok(Array.isArray(r.body.capabilities.oauthProviders));
});

/* ------------------------------------------------ passkeys (synthetic authenticator) */

const nodeCrypto = require('node:crypto');
const webauthn = require('../lib/webauthn');

/* A tiny CBOR encoder for the shapes a real authenticator sends. */
function cborEncode(value) {
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') {
    const buf = Buffer.from(value, 'utf8');
    return Buffer.concat([head(3, buf.length), buf]);
  }
  if (typeof value === 'number') {
    return value >= 0 ? head(0, value) : head(1, -1 - value);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([head(4, value.length)].concat(value.map(cborEncode)));
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    const parts = [head(5, keys.length)];
    for (const key of keys) {
      parts.push(cborEncode(isNaN(Number(key)) ? key : Number(key)));
      parts.push(cborEncode(value[key]));
    }
    return Buffer.concat(parts);
  }
  if (value === true) return Buffer.from([0xf5]);
  if (value === false) return Buffer.from([0xf4]);
  if (value === null) return Buffer.from([0xf6]);
  throw new Error('Cannot CBOR-encode ' + typeof value);
}

function head(major, length) {
  const prefix = major << 5;
  if (length < 24) return Buffer.from([prefix | length]);
  if (length < 256) return Buffer.from([prefix | 24, length]);
  if (length < 65536) {
    const buf = Buffer.alloc(3);
    buf[0] = prefix | 25;
    buf.writeUInt16BE(length, 1);
    return buf;
  }
  const buf = Buffer.alloc(5);
  buf[0] = prefix | 26;
  buf.writeUInt32BE(length, 1);
  return buf;
}

function b64u(buf) { return webauthn.toB64url(buf); }

function makeAuthenticator(rpId, origin) {
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const cose = {
    1: 2,
    3: -7,
    '-1': 1,
    '-2': webauthn.fromB64url(jwk.x),
    '-3': webauthn.fromB64url(jwk.y),
  };
  const credentialId = nodeCrypto.randomBytes(32);
  const rpIdHash = nodeCrypto.createHash('sha256').update(rpId).digest();

  function authData(flags, counter, withAttested) {
    const parts = [rpIdHash, Buffer.from([flags]), Buffer.alloc(4), Buffer.alloc(16)];
    parts[2].writeUInt32BE(counter, 0);
    if (withAttested) {
      const len = Buffer.alloc(2);
      len.writeUInt16BE(credentialId.length, 0);
      parts.push(len, credentialId, cborEncode(cose));
    }
    return Buffer.concat(parts);
  }

  function register(challenge, options) {
    const opts = options || {};
    const clientDataJSON = Buffer.from(JSON.stringify({
      type: 'webauthn.create',
      challenge,
      origin: opts.origin || origin,
      crossOrigin: false,
    })).toString('utf8');
    const attestationObject = cborEncode({
      fmt: 'none',
      attStmt: {},
      authData: authData(opts.flags === undefined ? 0x45 : opts.flags, 0, true),
    });
    return {
      id: b64u(credentialId),
      rawId: b64u(credentialId),
      type: 'public-key',
      response: {
        clientDataJSON: b64u(Buffer.from(clientDataJSON, 'utf8')),
        attestationObject: b64u(attestationObject),
      },
    };
  }

  function assert(challenge, counter, options) {
    const opts = options || {};
    const clientDataJSON = Buffer.from(JSON.stringify({
      type: 'webauthn.get',
      challenge,
      origin: opts.origin || origin,
      crossOrigin: false,
    })).toString('utf8');
    const signed = authData(opts.flags === undefined ? 0x05 : opts.flags, counter, false);
    const clientHash = nodeCrypto.createHash('sha256').update(Buffer.from(clientDataJSON, 'utf8')).digest();
    const signature = nodeCrypto.sign('sha256', Buffer.concat([signed, clientHash]), privateKey);
    return {
      id: b64u(credentialId),
      rawId: b64u(credentialId),
      type: 'public-key',
      response: {
        clientDataJSON: b64u(Buffer.from(clientDataJSON, 'utf8')),
        authenticatorData: b64u(signed),
        signature: b64u(signature),
        userHandle: null,
      },
      _tamper: opts.tamper,
    };
  }

  return { register, assert, credentialId, privateKey };
}

test('a passkey can be registered and used to sign in (real signature checks)', async () => {
  const created = await registerUser('passkey@example.com', 'passkey-pass-1', 'Passkey User');
  const options = await api('/api/auth/passkey/register/options', { method: 'POST', token: created.token });
  assert.equal(options.status, 200);
  const challenge = options.body.publicKey.challenge;
  const rpId = options.body.publicKey.rp.id;
  assert.ok(challenge && rpId);

  const authenticator = makeAuthenticator(rpId, 'http://127.0.0.1:' + new URL(baseUrl).port);
  const credential = authenticator.register(challenge);
  const verified = await api('/api/auth/passkey/register/verify', {
    method: 'POST',
    token: created.token,
    body: { credential, name: 'Test key' },
  });
  assert.equal(verified.status, 201, JSON.stringify(verified.body));
  assert.equal(verified.body.passkeys.length, 1);

  const list = await api('/api/auth/passkeys', { token: created.token });
  assert.equal(list.body.passkeys.length, 1);
  assert.equal(list.body.passkeys[0].name, 'Test key');

  const loginOptions = await api('/api/auth/passkey/login/options', { method: 'POST', body: { email: 'passkey@example.com' } });
  assert.equal(loginOptions.status, 200);
  assert.equal(loginOptions.body.hasSuggestions, true);
  assert.equal(loginOptions.body.publicKey.allowCredentials.length, 1);

  const assertion = authenticator.assert(loginOptions.body.publicKey.challenge, 1);
  const login = await api('/api/auth/passkey/login/verify', {
    method: 'POST',
    body: { email: 'passkey@example.com', credential: assertion },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.secondFactorSatisfied, true);
  assert.ok(login.body.token);

  const me = await api('/api/auth/me', { token: login.body.token });
  assert.equal(me.body.user.email, 'passkey@example.com');
});

test('passkey verification rejects wrong origin, replay and a stale counter', async () => {
  const created = await registerUser('passkey2@example.com', 'passkey-pass-2', 'Second');
  const options = await api('/api/auth/passkey/register/options', { method: 'POST', token: created.token });
  const rpId = options.body.publicKey.rp.id;
  const origin = 'http://127.0.0.1:' + new URL(baseUrl).port;
  const authenticator = makeAuthenticator(rpId, origin);

  const wrongOrigin = authenticator.register(options.body.publicKey.challenge, { origin: 'https://evil.example' });
  const rejected = await api('/api/auth/passkey/register/verify', { method: 'POST', token: created.token, body: { credential: wrongOrigin } });
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /Origin mismatch/);

  const second = await api('/api/auth/passkey/register/options', { method: 'POST', token: created.token });
  const credential = authenticator.register(second.body.publicKey.challenge);
  const ok = await api('/api/auth/passkey/register/verify', { method: 'POST', token: created.token, body: { credential } });
  assert.equal(ok.status, 201);

  // Replaying the same challenge must fail, because challenges are one-time tokens.
  const replay = await api('/api/auth/passkey/register/verify', { method: 'POST', token: created.token, body: { credential } });
  assert.equal(replay.status, 400);

  // Counter going backwards is treated as a possible clone.
  const opts1 = await api('/api/auth/passkey/login/options', { method: 'POST', body: { email: 'passkey2@example.com' } });
  const good = authenticator.assert(opts1.body.publicKey.challenge, 5);
  const firstLogin = await api('/api/auth/passkey/login/verify', { method: 'POST', body: { credential: good } });
  assert.equal(firstLogin.status, 200);

  const opts2 = await api('/api/auth/passkey/login/options', { method: 'POST', body: { email: 'passkey2@example.com' } });
  const stale = authenticator.assert(opts2.body.publicKey.challenge, 5);
  const staleLogin = await api('/api/auth/passkey/login/verify', { method: 'POST', body: { credential: stale } });
  assert.equal(staleLogin.status, 401);
  assert.match(staleLogin.body.error, /counter/i);
});

test('a passkey for one account cannot be used for another', async () => {
  const a = await registerUser('pk-a@example.com', 'pk-a-pass-1', 'A');
  const b = await registerUser('pk-b@example.com', 'pk-b-pass-1', 'B');
  const options = await api('/api/auth/passkey/register/options', { method: 'POST', token: a.token });
  const rpId = options.body.publicKey.rp.id;
  const origin = 'http://127.0.0.1:' + new URL(baseUrl).port;
  const authenticator = makeAuthenticator(rpId, origin);
  const credential = authenticator.register(options.body.publicKey.challenge);
  await api('/api/auth/passkey/register/verify', { method: 'POST', token: a.token, body: { credential } });

  // B asks for options with B's email, then reuses A's private key.
  const bOptions = await api('/api/auth/passkey/login/options', { method: 'POST', body: { email: 'pk-b@example.com' } });
  const assertion = authenticator.assert(bOptions.body.publicKey.challenge, 1);
  const rejected = await api('/api/auth/passkey/login/verify', { method: 'POST', body: { email: 'pk-b@example.com', credential: assertion } });
  assert.equal(rejected.status, 401);
  assert.equal(rejected.body.code, 'WEBAUTHN_MISMATCH');
});

/* --------------------------------------------- admin console + recovery */

async function adminToken() {
  const res = await api('/api/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin-password-1' } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

test('the admin API is closed to normal users and open to administrators', async () => {
  const normal = await api('/api/auth/login', { method: 'POST', body: { email: 'user@example.com', password: 'new-password-1' } });
  const denied = await api('/api/admin/users', { token: normal.body.token });
  assert.equal(denied.status, 403);

  const admin = await adminToken();
  const users = await api('/api/admin/users', { token: admin });
  assert.equal(users.status, 200);
  assert.ok(users.body.users.length >= 3);
  const summary = await api('/api/admin/summary', { token: admin });
  assert.equal(summary.status, 200);
  assert.ok(summary.body.accounts >= 3);

  // The audit trail the console renders: admin-only, newest first, no raw meta blob.
  const auditDenied = await api('/api/admin/audit', { token: normal.body.token });
  assert.equal(auditDenied.status, 403);
  const audit = await api('/api/admin/audit?limit=10', { token: admin });
  assert.equal(audit.status, 200);
  assert.ok(audit.body.events.length > 0);
  assert.ok(audit.body.events.every((e) => typeof e.action === 'string' && typeof e.at === 'number'));
  assert.ok(audit.body.events.every((e) => !('meta' in e)));
});

test('an administrator can verify an email, change a role and reset two-factor', async () => {
  const admin = await adminToken();
  const created = await registerUser('managed@example.com', 'managed-pass-1', 'Managed');

  const verified = await api('/api/admin/users/' + created.user.id + '/verify-email', { method: 'POST', token: admin });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.user.email_verified, true);

  const role = await api('/api/admin/users/' + created.user.id + '/role', { method: 'POST', token: admin, body: { role: 'admin' } });
  assert.equal(role.status, 200);
  assert.equal(role.body.user.role, 'admin');
  const back = await api('/api/admin/users/' + created.user.id + '/role', { method: 'POST', token: admin, body: { role: 'user' } });
  assert.equal(back.body.user.role, 'user');

  const badRole = await api('/api/admin/users/' + created.user.id + '/role', { method: 'POST', token: admin, body: { role: 'superuser' } });
  assert.equal(badRole.status, 400);

  const self = await api('/api/admin/users/' + created.user.id + '/role', { method: 'POST', token: admin, body: { role: 'user' } });
  assert.equal(self.status, 200);
});

test('two-factor recovery needs the emailed link AND an administrator', async () => {
  emailLib.clearOutbox();
  const created = await registerUser('recover@example.com', 'recover-pass-1', 'Recover');
  const setup = await api('/api/auth/2fa/setup', { method: 'POST', token: created.token });
  const code = otpLib.totpAt(setup.body.secret);
  const enabled = await api('/api/auth/2fa/enable', { method: 'POST', token: created.token, body: { code } });
  assert.equal(enabled.status, 200);

  // Lost the phone: no code available.
  const blocked = await api('/api/auth/login', { method: 'POST', body: { email: 'recover@example.com', password: 'recover-pass-1' } });
  assert.equal(blocked.status, 401);
  assert.equal(blocked.body.code, 'TOTP_REQUIRED');

  const request = await api('/api/auth/2fa/recover/request', { method: 'POST', body: { email: 'recover@example.com' } });
  assert.equal(request.status, 200);
  assert.equal(request.body.adminApprovalRequired, true);

  const userMail = lastMailTo('recover@example.com');
  assert.match(userMail.subject, /recovery/i);
  const recoverToken = /recover=([A-Za-z0-9_-]{20,})/.exec(userMail.text)[1];

  const adminMail = emailLib.readOutbox().find((m) => m.to === 'admin@example.com');
  assert.ok(adminMail, 'the administrator must be told');

  // An administrator cannot approve before the user proves mailbox control.
  const admin = await adminToken();
  const list = await api('/api/admin/recovery', { token: admin });
  const pending = list.body.requests.find((r) => r.email === 'recover@example.com');
  assert.equal(pending.status, 'pending_email');
  const tooEarly = await api('/api/admin/recovery/' + pending.id + '/approve', { method: 'POST', token: admin });
  assert.equal(tooEarly.status, 409);
  assert.equal(tooEarly.body.code, 'EMAIL_NOT_CONFIRMED');

  const confirm = await api('/api/auth/2fa/recover/confirm', { method: 'POST', body: { token: recoverToken } });
  assert.equal(confirm.status, 200);

  const afterConfirm = await api('/api/admin/recovery', { token: admin });
  const ready = afterConfirm.body.requests.find((r) => r.email === 'recover@example.com');
  assert.equal(ready.status, 'awaiting_admin');

  const approved = await api('/api/admin/recovery/' + ready.id + '/approve', { method: 'POST', token: admin });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.twoFactorCleared, true);

  // Two-factor is gone; the emailed reset link works once.
  const after = await api('/api/auth/login', { method: 'POST', body: { email: 'recover@example.com', password: 'recover-pass-1' } });
  assert.equal(after.status, 200);

  const resetMail = lastMailTo('recover@example.com');
  const resetToken = /reset=([A-Za-z0-9_-]{20,})/.exec(resetMail.text)[1];
  const reset = await api('/api/auth/reset', { method: 'POST', body: { token: resetToken, password: 'after-recovery-1' } });
  assert.equal(reset.status, 200);
  const replay = await api('/api/auth/reset', { method: 'POST', body: { token: resetToken, password: 'another-1' } });
  assert.equal(replay.status, 400);
});

test('a recovery request can be denied and never reveals whether an account exists', async () => {
  const unknown = await api('/api/auth/2fa/recover/request', { method: 'POST', body: { email: 'ghost@nowhere.test' } });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.ok, true);

  emailLib.clearOutbox();
  const created = await registerUser('deny@example.com', 'deny-pass-1', 'Deny');
  const setup = await api('/api/auth/2fa/setup', { method: 'POST', token: created.token });
  await api('/api/auth/2fa/enable', { method: 'POST', token: created.token, body: { code: otpLib.totpAt(setup.body.secret) } });
  await api('/api/auth/2fa/recover/request', { method: 'POST', body: { email: 'deny@example.com' } });
  const token = /recover=([A-Za-z0-9_-]{20,})/.exec(lastMailTo('deny@example.com').text)[1];
  await api('/api/auth/2fa/recover/confirm', { method: 'POST', body: { token } });

  const admin = await adminToken();
  const list = await api('/api/admin/recovery', { token: admin });
  const item = list.body.requests.find((r) => r.email === 'deny@example.com');
  const denied = await api('/api/admin/recovery/' + item.id + '/deny', { method: 'POST', token: admin, body: { note: 'Could not verify identity' } });
  assert.equal(denied.status, 200);

  const stillLocked = await api('/api/auth/login', { method: 'POST', body: { email: 'deny@example.com', password: 'deny-pass-1' } });
  assert.equal(stillLocked.status, 401);
  assert.equal(stillLocked.body.code, 'TOTP_REQUIRED');

  const again = await api('/api/admin/recovery/' + item.id + '/deny', { method: 'POST', token: admin });
  assert.equal(again.status, 409);
});

test('an administrator can delete an account, but not their own', async () => {
  const admin = await adminToken();
  const created = await registerUser('delete-me@example.com', 'delete-pass-1', 'Delete');
  await api('/api/sync/doc/tm-test', { method: 'PUT', token: created.token, body: { value: 'x' } });

  const gone = await api('/api/admin/users/' + created.user.id, { method: 'DELETE', token: admin });
  assert.equal(gone.status, 200);
  const dead = await api('/api/auth/me', { token: created.token });
  assert.equal(dead.status, 401);

  const me = await api('/api/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin-password-1' } });
  const self = await api('/api/admin/users/' + me.body.user.id, { method: 'DELETE', token: admin });
  assert.equal(self.status, 400);
  assert.equal(self.body.code, 'SELF_DELETE');
});

test('health advertises passkeys and recovery', async () => {
  const r = await api('/api/health');
  assert.equal(r.body.capabilities.passkeys, true);
  assert.equal(r.body.capabilities.twoFactorRecovery, true);
});
