'use strict';

/* Exercises the real GitHub flow shapes with a mocked fetch:
   device code → pending → token → /user, plus PAT mode, roles and sessions. */

var t = require('./harness');
var path = require('path');

function makeStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
    key: function (i) { return Object.keys(data)[i] || null; },
    get length() { return Object.keys(data).length; },
    _dump: function () { return data; }
  };
}

global.localStorage = makeStorage();
global.sessionStorage = makeStorage();
global.window = { localStorage: global.localStorage, sessionStorage: global.sessionStorage };

var A = require(path.join(__dirname, '..', 'js', 'github-auth.js'));
var S = require(path.join(__dirname, '..', 'js', 'tm-store.js'));

var suite = t.suite;
var test = t.test;

function jsonResponse(body, status, headers) {
  var hdrs = headers || {};
  return {
    ok: (status || 200) >= 200 && (status || 200) < 300,
    status: status || 200,
    headers: { get: function (name) { return hdrs[name.toLowerCase()] || null; } },
    text: function () { return Promise.resolve(JSON.stringify(body)); },
    json: function () { return Promise.resolve(body); }
  };
}

function mockFetch(responses) {
  var calls = [];
  var fn = function (url, options) {
    calls.push({ url: url, options: options });
    var next = responses.shift();
    if (!next) throw new Error('unexpected request to ' + url);
    return Promise.resolve(next);
  };
  fn.calls = calls;
  return fn;
}

function reset() {
  A.signOut();
  A.configure({ clientId: '', admins: A.DEFAULT_ADMINS.slice(), repo: A.DEFAULT_REPO });
}

suite('GitHub auth · configuration', function () {
  test('no client id means device flow is refused with a clear message', async function () {
    reset();
    t.equal(A.getConfig().clientId, '');
    var threw = null;
    try { await A.startDeviceFlow({}); } catch (e) { threw = e; }
    t.ok(threw, 'expected an error');
    t.includes(threw.message, 'client ID');
  });

  test('configure() persists the client id', function () {
    reset();
    A.configure({ clientId: 'Iv1.abc123456789' });
    t.equal(A.getConfig().clientId, 'Iv1.abc123456789');
    t.equal(global.localStorage.getItem('tm-gh-client-id'), 'Iv1.abc123456789');
    A.configure({ clientId: '' });
    t.equal(A.getConfig().clientId, '');
  });

  test('default admins include the repository owner', function () {
    t.ok(A.DEFAULT_ADMINS.indexOf('abhishekagrahari307-max') !== -1);
    t.equal(A.DEFAULT_REPO, 'abhishekagrahari307-max/ITR-AND-GST');
  });
});

suite('GitHub auth · device flow', function () {
  test('startDeviceFlow maps GitHub’s response', async function () {
    reset();
    A.setFetch(mockFetch([jsonResponse({
      device_code: 'dev123', user_code: 'WDJB-MJHT',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900, interval: 5
    })]));
    var flow = await A.startDeviceFlow({ clientId: 'Iv1.test' });
    t.equal(flow.deviceCode, 'dev123');
    t.equal(flow.userCode, 'WDJB-MJHT');
    t.equal(flow.verificationUri, 'https://github.com/login/device');
    t.equal(flow.expiresIn, 900);
    t.equal(flow.interval, 5);
  });

  test('a bad client id surfaces GitHub’s error', async function () {
    reset();
    A.setFetch(mockFetch([jsonResponse({ error: 'invalid_client', error_description: 'Invalid client_id' })]));
    var threw = null;
    try { await A.startDeviceFlow({ clientId: 'wrong' }); } catch (e) { threw = e; }
    t.ok(threw);
    t.includes(threw.message, 'Invalid client_id');
  });

  test('polling waits through authorization_pending then returns a token', async function () {
    reset();
    A.setFetch(mockFetch([
      jsonResponse({ error: 'authorization_pending' }),
      jsonResponse({ error: 'authorization_pending' }),
      jsonResponse({ access_token: 'gho_token123', token_type: 'bearer', scope: 'read:user' })
    ]));
    var result = await A.pollForToken({ deviceCode: 'dev123', interval: 1, expiresIn: 60 }, { clientId: 'Iv1.test', wait: function () {} });
    t.equal(result.accessToken, 'gho_token123');
    t.equal(result.scope, 'read:user');
  });

  test('slow_down increases the wait but keeps polling', async function () {
    reset();
    var waits = [];
    A.setFetch(mockFetch([
      jsonResponse({ error: 'slow_down' }),
      jsonResponse({ access_token: 'gho_after_slowdown' })
    ]));
    var result = await A.pollForToken({ deviceCode: 'd', interval: 1, expiresIn: 60 }, {
      clientId: 'Iv1.test',
      wait: function (ms) { waits.push(ms); }
    });
    t.equal(result.accessToken, 'gho_after_slowdown');
    t.equal(waits[0], 6000, 'slow_down adds five seconds to the interval');
  });

  test('expired_token is reported as such', async function () {
    reset();
    A.setFetch(mockFetch([jsonResponse({ error: 'expired_token' })]));
    var threw = null;
    try { await A.pollForToken({ deviceCode: 'd', interval: 1, expiresIn: 60 }, { clientId: 'x', wait: function () {} }); } catch (e) { threw = e; }
    t.equal(threw.code, 'expired_token');
  });

  test('access_denied is reported as such', async function () {
    reset();
    A.setFetch(mockFetch([jsonResponse({ error: 'access_denied' })]));
    var threw = null;
    try { await A.pollForToken({ deviceCode: 'd', interval: 1, expiresIn: 60 }, { clientId: 'x', wait: function () {} }); } catch (e) { threw = e; }
    t.equal(threw.code, 'access_denied');
  });

  test('device_flow_disabled explains the OAuth App setting', async function () {
    reset();
    A.setFetch(mockFetch([jsonResponse({ error: 'device_flow_disabled' })]));
    var threw = null;
    try { await A.pollForToken({ deviceCode: 'd', interval: 1, expiresIn: 60 }, { clientId: 'x', wait: function () {} }); } catch (e) { threw = e; }
    t.equal(threw.code, 'device_flow_disabled');
    t.includes(threw.message, 'Device Flow');
  });

  test('a past expiry deadline stops the loop', async function () {
    reset();
    A.setFetch(mockFetch([]));
    var threw = null;
    try { await A.pollForToken({ deviceCode: 'd', interval: 1, expiresIn: -1 }, { clientId: 'x', wait: function () {} }); } catch (e) { threw = e; }
    t.equal(threw.code, 'timeout');
  });
});

suite('GitHub auth · token sign-in', function () {
  test('a valid token returns the GitHub profile', async function () {
    reset();
    A.setFetch(mockFetch([jsonResponse({
      login: 'octocat', id: 583231, name: 'The Octocat',
      avatar_url: 'https://avatars.example/octocat.png',
      html_url: 'https://github.com/octocat', public_repos: 8
    })]));
    var user = await A.fetchUser('ghp_abcdefghijklmnopqrstuvwx');
    t.equal(user.login, 'octocat');
    t.equal(user.name, 'The Octocat');
  });

  test('a 401 is reported as an expired or revoked token', async function () {
    reset();
    A.setFetch(mockFetch([jsonResponse({ message: 'Bad credentials' }, 401)]));
    var threw = null;
    try { await A.fetchUser('ghp_bad'); } catch (e) { threw = e; }
    t.equal(threw.status, 401);
    t.includes(threw.message, 'revoked');
  });

  test('an exhausted rate limit is explained', async function () {
    reset();
    A.setFetch(mockFetch([jsonResponse({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0' })]));
    var threw = null;
    try { await A.fetchUser('ghp_x'); } catch (e) { threw = e; }
    t.includes(threw.message, 'rate limit');
  });

  test('obviously malformed tokens are rejected before any request', async function () {
    reset();
    A.setFetch(mockFetch([]));
    var threw = null;
    try { await A.signInWithToken('short'); } catch (e) { threw = e; }
    t.includes(threw.message, 'does not look like a GitHub token');
    threw = null;
    try { await A.signInWithToken('   '); } catch (e) { threw = e; }
    t.includes(threw.message, 'Paste a token');
  });

  test('signInWithToken builds a session and tolerates a missing repo scope', async function () {
    reset();
    A.setFetch(mockFetch([
      jsonResponse({ login: 'regular-user', id: 2, name: 'Reg', avatar_url: 'a.png', html_url: 'h' }),
      jsonResponse({ message: 'Not Found' }, 404) // repo permission unavailable
    ]));
    var session = await A.signInWithToken('ghp_abcdefghijklmnopqrstuvwx', { remember: false });
    t.equal(session.login, 'regular-user');
    t.equal(session.role, 'user');
    t.equal(session.repoPermission, null);
    t.equal(A.isSignedIn(), true);
  });

  test('a Bearer prefix in the pasted token is stripped', async function () {
    reset();
    var mock = mockFetch([jsonResponse({ login: 'prefixed', id: 3 })]);
    A.setFetch(mock);
    await A.signInWithToken('Bearer ghp_abcdefghijklmnopqrstuvwx', {});
    var auth = mock.calls[0].options.headers.Authorization;
    t.equal(auth, 'Bearer ghp_abcdefghijklmnopqrstuvwx', 'the header should have exactly one Bearer prefix');
  });
});

suite('GitHub auth · roles', function () {
  test('the configured owner is an administrator', function () {
    var role = A.resolveRole({ login: 'abhishekagrahari307-max' });
    t.equal(role.role, 'admin');
    t.includes(role.reason, 'administrator');
  });

  test('everyone else is a user', function () {
    var role = A.resolveRole({ login: 'someone-else' });
    t.equal(role.role, 'user');
  });

  test('repository admin permission also grants admin', function () {
    var role = A.resolveRole({ login: 'collaborator' }, { repoPermission: { admin: true } });
    t.equal(role.role, 'admin');
    t.equal(role.repoAdmin, true);
  });

  test('write-only or read-only repository access does not', function () {
    t.equal(A.resolveRole({ login: 'writer' }, { repoPermission: { admin: false, push: true } }).role, 'user');
    t.equal(A.resolveRole({ login: 'reader' }, { repoPermission: { admin: false, push: false } }).role, 'user');
  });

  test('logins match case-insensitively', function () {
    t.equal(A.resolveRole({ login: 'AbhishekAgrahari307-Max' }).role, 'admin');
  });

  test('an empty user is never an admin', function () {
    t.equal(A.resolveRole(null).role, 'user');
    t.equal(A.resolveRole({}).role, 'user');
  });

  test('a custom admin list is respected', function () {
    t.equal(A.resolveRole({ login: 'custom-admin' }, { admins: ['custom-admin'] }).role, 'admin');
  });
});

suite('GitHub auth · sessions', function () {
  test('remember=true writes to localStorage', function () {
    reset();
    A.saveSession({ token: 't', login: 'octocat', role: 'user' }, true);
    t.ok(global.localStorage.getItem('tm-gh-session'), 'expected a localStorage session');
    t.equal(global.sessionStorage.getItem('tm-gh-session-tmp'), null);
    t.equal(A.getSession().storage, 'local');
  });

  test('remember=false writes to sessionStorage only', function () {
    reset();
    A.saveSession({ token: 't', login: 'octocat', role: 'user' }, false);
    t.ok(global.sessionStorage.getItem('tm-gh-session-tmp'));
    t.equal(global.localStorage.getItem('tm-gh-session'), null);
    t.equal(A.getSession().storage, 'session');
  });

  test('signOut clears both stores', function () {
    reset();
    A.saveSession({ token: 't', login: 'octocat' }, true);
    A.saveSession({ token: 't', login: 'octocat' }, false);
    A.signOut();
    t.equal(A.getSession(), null);
    t.equal(A.isSignedIn(), false);
  });

  test('a corrupted session is ignored', function () {
    reset();
    global.localStorage.setItem('tm-gh-session', '{not json');
    t.equal(A.getSession(), null);
    global.localStorage.setItem('tm-gh-session', JSON.stringify({ login: 'no-token' }));
    t.equal(A.getSession(), null, 'a session without a token is not usable');
  });

  test('refreshSession drops a revoked token', async function () {
    reset();
    A.saveSession({ token: 'revoked', login: 'octocat', role: 'user' }, true);
    A.setFetch(mockFetch([jsonResponse({ message: 'Bad credentials' }, 401)]));
    var result = await A.refreshSession();
    t.equal(result, null);
    t.equal(A.isSignedIn(), false, 'a 401 must sign the user out');
  });

  test('profileId is a safe storage namespace', function () {
    t.equal(A.profileId({ login: 'AbhishekAgrahari307-Max' }), 'gh-abhishekagrahari307-max');
    t.equal(A.profileId({ login: 'user.name/weird' }), 'gh-usernameweird');
    t.equal(A.profileId(null), '');
  });

  test('isAdmin reflects the stored role', function () {
    reset();
    A.saveSession({ token: 't', login: 'abhishekagrahari307-max', role: 'admin' }, true);
    t.equal(A.isAdmin(), true);
    A.saveSession({ token: 't', login: 'someone', role: 'user' }, true);
    t.equal(A.isAdmin(), false);
  });
});

suite('GitHub auth · per-account data isolation', function () {
  test('two accounts keep separate books', function () {
    S.setNamespace('');
    S.saveList('invoices', [{ id: 'guest' }]);
    S.setNamespace('gh-alice');
    S.saveList('invoices', [{ id: 'alice' }]);
    S.setNamespace('gh-bob');
    S.saveList('invoices', [{ id: 'bob' }]);

    S.setNamespace('gh-alice');
    t.deepEqual(S.list('invoices'), [{ id: 'alice' }]);
    S.setNamespace('gh-bob');
    t.deepEqual(S.list('invoices'), [{ id: 'bob' }]);
    S.setNamespace('');
    t.deepEqual(S.list('invoices'), [{ id: 'guest' }]);
  });

  test('the signed-out keys are untouched by account namespaces', function () {
    t.ok(global.localStorage.getItem('tm-billing-invoices'), 'legacy key should still exist');
    t.ok(global.localStorage.getItem('tm-gh-alice-billing-invoices'), 'namespaced key should exist');
  });

  test('listNamespaces finds the local profiles', function () {
    var found = S.listNamespaces().map(function (p) { return p.namespace; });
    t.ok(found.indexOf('gh-alice') !== -1);
    t.ok(found.indexOf('gh-bob') !== -1);
  });

  test('migrateNamespace copies without overwriting', function () {
    S.setNamespace('');
    S.saveList('customers', [{ id: 'guest-customer' }]);
    var copied = S.migrateNamespace('', 'gh-carol');
    t.ok(copied.indexOf('customers') !== -1);
    S.setNamespace('gh-carol');
    t.deepEqual(S.list('customers'), [{ id: 'guest-customer' }]);

    S.setNamespace('');
    S.saveList('customers', [{ id: 'changed' }]);
    S.migrateNamespace('', 'gh-carol');
    S.setNamespace('gh-carol');
    t.deepEqual(S.list('customers'), [{ id: 'guest-customer' }], 'existing account data must win');
  });

  test('switching namespace never leaks the other account’s settings', function () {
    S.setNamespace('gh-alice');
    S.saveSettings({ businessName: 'Alice Traders' });
    S.setNamespace('gh-bob');
    t.equal(S.getSettings().businessName, '');
    S.setNamespace('');
  });
});
