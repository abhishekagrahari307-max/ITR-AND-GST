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
