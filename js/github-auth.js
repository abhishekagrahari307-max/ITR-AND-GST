/* ===================================================
   TaxMitra – GitHub authentication (real, no backend)

   Two ways in, both genuine GitHub API calls:
     1. OAuth Device Flow  – the standard flow for static sites. Only a
        public client_id is needed (no client secret is ever shipped).
     2. Personal Access Token – pasted by the user, verified against
        GET https://api.github.com/user.

   Roles:
     admin – your GitHub login is listed in ADMIN_LOGINS, or the token
             reports admin permission on the configured repository.
     user  – any other authenticated GitHub account.

   Security notes (deliberate, not hidden):
   * The token is kept in this browser only. With "remember me" it lives in
     localStorage, otherwise in sessionStorage; that is readable by any
     script on this origin, so treat this site's XSS surface seriously.
   * Revoking access is done on github.com (Settings → Applications), not
     from here: revoking needs the client secret, which a static site must
     never contain.
   =================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TMGitHubAuth = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var GITHUB_API = 'https://api.github.com';
  var DEVICE_CODE_URL = 'https://github.com/login/device/code';
  var ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

  var CLIENT_ID_KEY = 'tm-gh-client-id';
  var SESSION_KEY = 'tm-gh-session';      // localStorage: remember me
  var SESSION_TMP = 'tm-gh-session-tmp';  // sessionStorage: this tab only

  /* Owner of this deployment is the default admin. */
  var DEFAULT_ADMINS = ['abhishekagrahari307-max'];
  var DEFAULT_REPO = 'abhishekagrahari307-max/ITR-AND-GST';

  var config = {
    clientId: '',
    scope: 'read:user',
    admins: DEFAULT_ADMINS.slice(),
    repo: DEFAULT_REPO
  };

  /* Injectable fetch so the whole flow can be tested without a network. */
  var httpFetch = (typeof fetch === 'function') ? fetch.bind(typeof globalThis !== 'undefined' ? globalThis : this) : null;

  function setFetch(fn) { httpFetch = fn; }

  function getFetch() {
    if (!httpFetch && typeof fetch === 'function') httpFetch = fetch.bind(typeof globalThis !== 'undefined' ? globalThis : this);
    if (!httpFetch) throw new Error('fetch is not available in this environment');
    return httpFetch;
  }

  /* ------------------------- config ------------------------- */

  function getConfig() {
    var stored = null;
    try {
      stored = localStorage.getItem(CLIENT_ID_KEY);
    } catch (e) { stored = null; }
    return {
      clientId: config.clientId || stored || '',
      scope: config.scope,
      admins: config.admins.slice(),
      repo: config.repo
    };
  }

  function configure(options) {
    var opts = options || {};
    if (opts.clientId !== undefined) {
      config.clientId = String(opts.clientId || '').trim();
      try {
        if (config.clientId) localStorage.setItem(CLIENT_ID_KEY, config.clientId);
        else localStorage.removeItem(CLIENT_ID_KEY);
      } catch (e) { /* storage may be unavailable */ }
    }
    if (opts.admins) config.admins = opts.admins.slice();
    if (opts.repo) config.repo = opts.repo;
    if (opts.scope) config.scope = opts.scope;
    return getConfig();
  }

  /* ------------------------- low-level HTTP ------------------------- */

  async function postForm(url, body, accept) {
    var response = await getFetch()(url, {
      method: 'POST',
      headers: {
        'Accept': accept || 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    var text = await response.text();
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // Older servers answer form-encoded; parse that as a fallback.
      data = {};
      text.split('&').forEach(function (pair) {
        var parts = pair.split('=');
        if (parts.length === 2) data[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
      });
    }
    if (!response.ok && !data.error) {
      var error = new Error('GitHub returned HTTP ' + response.status);
      error.status = response.status;
      error.body = data;
      throw error;
    }
    return data;
  }

  async function getJSON(url, token) {
    var headers = { 'Accept': 'application/vnd.github+json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    var response = await getFetch()(url, { method: 'GET', headers: headers });
    var remaining = response.headers && response.headers.get ? response.headers.get('x-ratelimit-remaining') : null;
    if (response.status === 401) {
      var unauth = new Error('GitHub rejected the token (401). It may be expired or revoked.');
      unauth.status = 401;
      throw unauth;
    }
    if (response.status === 403 && remaining === '0') {
      var limited = new Error('GitHub API rate limit reached. Try again later or sign in to raise the limit.');
      limited.status = 403;
      throw limited;
    }
    if (!response.ok) {
      var error = new Error('GitHub returned HTTP ' + response.status);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  /* ------------------------- device flow ------------------------- */

  /**
   * Step 1 – ask GitHub for a user code.
   * Returns { deviceCode, userCode, verificationUri, expiresIn, interval }.
   */
  async function startDeviceFlow(options) {
    var opts = options || {};
    var cfg = getConfig();
    var clientId = opts.clientId || cfg.clientId;
    if (!clientId) {
      throw new Error('No GitHub OAuth client ID configured. Create an OAuth App with Device Flow enabled and save its client ID first.');
    }
    var data = await postForm(DEVICE_CODE_URL, {
      client_id: clientId,
      scope: opts.scope || cfg.scope
    });
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }
    if (!data.device_code || !data.user_code) {
      throw new Error('GitHub did not return a device code. Check that Device Flow is enabled on the OAuth App.');
    }
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri || 'https://github.com/login/device',
      expiresIn: Number(data.expires_in) || 900,
      interval: Number(data.interval) || 5
    };
  }

  /**
   * Step 2 – poll for the token. GitHub answers 400 + error=authorization_pending
   * until the user approves. Returns an access token, or throws a typed error.
   */
  async function pollForToken(flow, options) {
    var opts = options || {};
    var cfg = getConfig();
    var clientId = opts.clientId || cfg.clientId;
    var interval = Math.max(1, Number(flow && flow.interval) || 5);
    var deadline = Date.now() + ((Number(flow && flow.expiresIn) || 900) * 1000);

    while (Date.now() < deadline) {
      var data = await postForm(ACCESS_TOKEN_URL, {
        client_id: clientId,
        device_code: flow.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      });

      if (data.access_token) {
        return { accessToken: data.access_token, scope: data.scope || '', tokenType: data.token_type || 'bearer' };
      }
      switch (data.error) {
        case 'authorization_pending':
          break;
        case 'slow_down':
          interval += 5;
          break;
        case 'expired_token': {
          var expired = new Error('The code expired before it was approved. Start again.');
          expired.code = 'expired_token';
          throw expired;
        }
        case 'access_denied': {
          var denied = new Error('You cancelled the GitHub authorisation.');
          denied.code = 'access_denied';
          throw denied;
        }
        case 'device_flow_disabled': {
          var disabled = new Error('Device Flow is not enabled on this OAuth App. Enable it in the app settings.');
          disabled.code = 'device_flow_disabled';
          throw disabled;
        }
        default: {
          var error = new Error(data.error_description || data.error || 'Unknown error from GitHub');
          error.code = data.error || 'unknown';
          throw error;
        }
      }
      await sleep(interval * 1000, opts);
    }
    var timeout = new Error('Timed out waiting for approval. Start again.');
    timeout.code = 'timeout';
    throw timeout;
  }

  function sleep(ms, options) {
    var opts = options || {};
    if (typeof opts.wait === 'function') return Promise.resolve(opts.wait(ms));
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /** Runs the whole flow with a callback so the UI can show the code immediately. */
  async function signInWithDeviceFlow(options) {
    var opts = options || {};
    var flow = await startDeviceFlow(opts);
    if (typeof opts.onCode === 'function') opts.onCode(flow);
    var token = await pollForToken(flow, opts);
    var user = await fetchUser(token.accessToken);
    var session = await completeSession(token.accessToken, user, opts);
    return session;
  }

  /* ------------------------- token mode ------------------------- */

  /** Verify a pasted PAT / fine-grained token and build a session from it. */
  async function signInWithToken(token, options) {
    var opts = options || {};
    var clean = String(token || '').trim().replace(/^Bearer\s+/i, '');
    if (!clean) throw new Error('Paste a token first.');
    if (!/^[A-Za-z0-9_]{20,}$/.test(clean)) {
      throw new Error('That does not look like a GitHub token (expected 20+ letters, digits or underscores).');
    }
    var user = await fetchUser(clean);
    return completeSession(clean, user, opts);
  }

  async function fetchUser(token) {
    var user = await getJSON(GITHUB_API + '/user', token);
    if (!user || !user.login) throw new Error('GitHub did not return a user for that token.');
    return user;
  }

  /* ------------------------- roles ------------------------- */

  /**
   * Decide the role. Admin requires either an explicit login match or,
   * when the token carries repository scope, admin permission on the repo.
   */
  function resolveRole(user, options) {
    var opts = options || {};
    var cfg = getConfig();
    var admins = (opts.admins || cfg.admins).map(function (login) { return String(login).toLowerCase(); });
    var login = String((user && user.login) || '').toLowerCase();
    if (!login) return { role: 'user', reason: 'not signed in', adminMatch: false, repoAdmin: false };
    if (admins.indexOf(login) !== -1) {
      return { role: 'admin', reason: 'login is listed as an administrator', adminMatch: true, repoAdmin: false };
    }
    if (opts.repoPermission && opts.repoPermission.admin === true) {
      return { role: 'admin', reason: 'token has admin permission on ' + (opts.repo || cfg.repo), adminMatch: false, repoAdmin: true };
    }
    return { role: 'user', reason: 'authenticated GitHub account', adminMatch: false, repoAdmin: false };
  }

  /** Optional extra check: does this token have admin on the repo? */
  async function repoPermission(token, repo) {
    var cfg = getConfig();
    var slug = repo || cfg.repo;
    if (!slug || !token) return null;
    try {
      var data = await getJSON(GITHUB_API + '/repos/' + slug, token);
      return {
        admin: !!(data.permissions && data.permissions.admin),
        push: !!(data.permissions && data.permissions.push),
        fullName: data.full_name || slug
      };
    } catch (e) {
      // A token without repo scope simply cannot answer this; that is fine.
      return null;
    }
  }

  async function completeSession(token, user, options) {
    var opts = options || {};
    var permission = opts.checkRepo === false ? null : await repoPermission(token, opts.repo);
    var roleInfo = resolveRole(user, {
      admins: opts.admins,
      repo: opts.repo,
      repoPermission: permission
    });
    var session = {
      token: token,
      login: user.login,
      id: user.id,
      name: user.name || user.login,
      avatarUrl: user.avatar_url || '',
      htmlUrl: user.html_url || '',
      publicRepos: typeof user.public_repos === 'number' ? user.public_repos : null,
      role: roleInfo.role,
      roleReason: roleInfo.reason,
      repoPermission: permission,
      scope: opts.scope || '',
      signedInAt: new Date().toISOString(),
      storage: opts.remember ? 'local' : 'session'
    };
    saveSession(session, opts.remember);
    return session;
  }

  /* ------------------------- session ------------------------- */

  function storageFor(remember) {
    try {
      return remember ? window.localStorage : window.sessionStorage;
    } catch (e) {
      return null;
    }
  }

  function saveSession(session, remember) {
    var payload = JSON.stringify(session);
    try {
      if (remember) {
        window.localStorage.setItem(SESSION_KEY, payload);
        window.sessionStorage.removeItem(SESSION_TMP);
      } else {
        window.sessionStorage.setItem(SESSION_TMP, payload);
        window.localStorage.removeItem(SESSION_KEY);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Read the stored session without trusting it blindly. */
  function getSession() {
    var raw = null;
    var source = null;
    try {
      raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) source = 'local';
      if (!raw) {
        raw = window.sessionStorage.getItem(SESSION_TMP);
        if (raw) source = 'session';
      }
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    try {
      var session = JSON.parse(raw);
      if (!session || !session.token || !session.login) return null;
      session.storage = source;
      return session;
    } catch (e) {
      return null;
    }
  }

  function isSignedIn() {
    return !!getSession();
  }

  function isAdmin() {
    var session = getSession();
    return !!session && session.role === 'admin';
  }

  /** Signs out locally. Token revocation happens on github.com. */
  function signOut() {
    try {
      window.localStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SESSION_TMP);
    } catch (e) { /* ignore */ }
    return true;
  }

  /** Re-read the profile from GitHub so a revoked token is detected. */
  async function refreshSession() {
    var session = getSession();
    if (!session) return null;
    try {
      var user = await fetchUser(session.token);
      var permission = await repoPermission(session.token);
      var roleInfo = resolveRole(user, { repoPermission: permission });
      var updated = Object.assign({}, session, {
        login: user.login,
        name: user.name || user.login,
        avatarUrl: user.avatar_url || '',
        role: roleInfo.role,
        roleReason: roleInfo.reason,
        repoPermission: permission,
        checkedAt: new Date().toISOString()
      });
      saveSession(updated, session.storage === 'local');
      return updated;
    } catch (error) {
      if (error && error.status === 401) {
        signOut();
        return null;
      }
      throw error;
    }
  }

  /** Stable id used to namespace this browser's local data per account. */
  function profileId(session) {
    // No argument → the current session. An explicitly empty argument stays empty.
    var s = arguments.length === 0 ? getSession() : session;
    if (!s || !s.login) return '';
    return 'gh-' + String(s.login).toLowerCase().replace(/[^a-z0-9-]/g, '');
  }

  return {
    GITHUB_API: GITHUB_API,
    DEFAULT_ADMINS: DEFAULT_ADMINS,
    DEFAULT_REPO: DEFAULT_REPO,
    getConfig: getConfig,
    configure: configure,
    setFetch: setFetch,
    startDeviceFlow: startDeviceFlow,
    pollForToken: pollForToken,
    signInWithDeviceFlow: signInWithDeviceFlow,
    signInWithToken: signInWithToken,
    fetchUser: fetchUser,
    repoPermission: repoPermission,
    resolveRole: resolveRole,
    getSession: getSession,
    saveSession: saveSession,
    refreshSession: refreshSession,
    isSignedIn: isSignedIn,
    isAdmin: isAdmin,
    signOut: signOut,
    profileId: profileId
  };
});
