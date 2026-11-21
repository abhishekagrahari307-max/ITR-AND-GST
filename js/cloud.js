/* ============================================================
   TaxMitra Cloud – real accounts, real sync, real AI proxy
   Browser client for server/index.js.

   Works with zero backend: everything here is additive. If no
   TaxMitra server answers /api/health, `TMCloud.available` stays
   false and the site behaves exactly as before (local-first).

   Load order: after tm-store.js (optional), before page controllers.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TMCloud = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TOKEN_KEY = 'tm_cloud_token';
  var USER_KEY = 'tm_cloud_user';
  var META_PREFIX = 'tm_cloud_meta_';

  var LOCAL_KEY_RE = /^(tm[-_]|itr_draft)/;
  var NEVER_SYNC = {
    tm_keys: 1,                 // AI keys typed by a visitor — never upload
    tm_access_token: 1,
    tm_refresh_token: 1,
    tm_user: 1,
    tm_cloud_token: 1,
    tm_cloud_user: 1,
    tm_proxy_url: 1,
    tm_use_netlify: 1,
    tm_theme: 1,
    tm_lang: 1
  };

  var state = {
    available: false,
    checked: false,
    apiBase: '',
    health: null,
    user: null,
    token: '',
    syncing: false,
    lastSync: null,
    lastError: null,
    autoTimer: null,
  };

  var listeners = {};

  function on(event, fn) {
    (listeners[event] || (listeners[event] = [])).push(fn);
    return function () {
      var list = listeners[event] || [];
      var index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
    };
  }

  function emit(event, payload) {
    (listeners[event] || []).forEach(function (fn) {
      try { fn(payload); } catch (e) { /* a listener must not break sync */ }
    });
  }

  function ls() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }

  function readJSON(key, fallback) {
    var store = ls();
    if (!store) return fallback;
    try {
      var raw = store.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function writeJSON(key, value) {
    var store = ls();
    if (!store) return false;
    try { store.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  /* ---------------------------------------------------------------- http */

  function apiBase() {
    if (state.apiBase) return state.apiBase;
    var override = typeof window !== 'undefined' ? window.TAXMITRA_API_URL : '';
    state.apiBase = (override || '/api').replace(/\/$/, '');
    return state.apiBase;
  }

  function request(path, options) {
    var opts = options || {};
    if (typeof fetch !== 'function') {
      var offline = new Error('This browser context has no fetch. Cloud features need a normal page load (or Node 18+).');
      offline.code = 'NO_FETCH';
      return Promise.reject(offline);
    }
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    if (opts.headers) {
      Object.keys(opts.headers).forEach(function (k) { headers[k] = opts.headers[k]; });
    }
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, opts.timeout || 20000) : null;

    return fetch(apiBase() + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller ? controller.signal : undefined,
      credentials: 'omit',
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = { error: text.slice(0, 300) }; }
        if (!res.ok) {
          var err = new Error((data && data.error) || ('HTTP ' + res.status));
          err.status = res.status;
          err.code = (data && data.code) || 'HTTP_' + res.status;
          err.payload = data;
          throw err;
        }
        return data;
      });
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        var timeoutErr = new Error('The TaxMitra server did not answer in time.');
        timeoutErr.code = 'TIMEOUT';
        throw timeoutErr;
      }
      throw err;
    });
  }

  /* --------------------------------------------------------------- probe */

  function probe() {
    if (state.checked) return Promise.resolve(state.available);
    state.checked = true;
    if (typeof fetch !== 'function') { state.available = false; return Promise.resolve(false); }
    return fetch(apiBase() + '/health', { method: 'GET', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (health) {
        if (!health || !health.ok) return false;
        state.available = true;
        state.health = health;
        if (health.capabilities && health.capabilities.ai) enableAiProxy();
        return true;
      })
      .catch(function () { return false; });
  }

  /* AI: reuse the proxy contract that js/ai-real.js already understands, so
     the browser stops needing a key the moment a server key exists. */
  /* js/ai-real.js speaks Gemini's shape (contents → candidates). Explain to it
     through the server's provider-agnostic /ai/chat, so a server configured with
     Groq, OpenAI or OpenRouter alone still gives visitors real answers. */
  function geminiToMessages(body) {
    var contents = (body && body.contents) || [];
    var messages = [];
    contents.forEach(function (entry) {
      if (!entry || !entry.parts) return;
      var text = entry.parts.map(function (part) { return part && part.text ? part.text : ''; }).join('').trim();
      if (!text) return;
      messages.push({ role: entry.role === 'model' ? 'assistant' : 'user', content: text });
    });
    return messages;
  }

  function enableAiProxy() {
    if (typeof window === 'undefined') return;
    var proxy = window.TAXMITRA_PROXY || (window.TAXMITRA_PROXY = {});
    proxy.url = apiBase() + '/ai';
    proxy.enabled = true;
    proxy.serverKey = true;
    proxy.through = 'chat';
    proxy.callGemini = function (body) {
      var messages = geminiToMessages(body);
      if (!messages.length) return Promise.reject(new Error('Empty prompt'));
      return request('/ai/chat', { method: 'POST', body: { messages: messages }, timeout: 60000 })
        .then(function (data) {
          return { candidates: [{ content: { parts: [{ text: data.text }] } }], model: data.model, provider: data.provider };
        });
    };
    proxy.callOpenRouter = function (body) {
      var messages = (body && body.messages) ? body.messages : [];
      return request('/ai/chat', { method: 'POST', body: { messages: messages }, timeout: 60000 })
        .then(function (data) {
          return { choices: [{ message: { role: 'assistant', content: data.text } }], model: data.model, provider: data.provider };
        });
    };
  }

  /* ---------------------------------------------------------------- auth */

  function setSession(token, user) {
    state.token = token || '';
    state.user = user || null;
    var store = ls();
    if (!store) return;
    try {
      if (token) store.setItem(TOKEN_KEY, token); else store.removeItem(TOKEN_KEY);
      if (user) store.setItem(USER_KEY, JSON.stringify(user)); else store.removeItem(USER_KEY);
    } catch (e) { /* quota */ }
  }

  function restore() {
    var store = ls();
    if (!store) return null;
    try {
      state.token = store.getItem(TOKEN_KEY) || '';
      state.user = readJSON(USER_KEY, null);
    } catch (e) {
      state.token = '';
      state.user = null;
    }
    return state.user;
  }

  function register(email, password, name) {
    return request('/auth/register', { method: 'POST', body: { email: email, password: password, name: name } })
      .then(function (data) {
        setSession(data.token, data.user);
        return data.user;
      });
  }

  function login(email, password, secondFactor) {
    var body = { email: email, password: password };
    if (secondFactor && secondFactor.totp) body.totp = secondFactor.totp;
    if (secondFactor && secondFactor.backupCode) body.backupCode = secondFactor.backupCode;
    return request('/auth/login', { method: 'POST', body: body })
      .then(function (data) {
        setSession(data.token, data.user);
        return data.user;
      });
  }

  function logout() {
    var hadToken = !!state.token;
    return (hadToken ? request('/auth/logout', { method: 'POST' }).catch(function () { return null; }) : Promise.resolve(null))
      .then(function () {
        stopAuto();
        setSession('', null);
        emit('status', status());
      });
  }

  function me() {
    if (!state.token) return Promise.reject(Object.assign(new Error('Not signed in to TaxMitra Cloud.'), { code: 'NOT_SIGNED_IN' }));
    return request('/auth/me').then(function (data) {
      state.user = data.user;
      writeJSON(USER_KEY, data.user);
      return data;
    });
  }

  /* ---- email verification & password reset ---- */

  function verifyEmail(token) {
    return request('/auth/verify', { method: 'POST', body: { token: token } });
  }

  function resendVerification() {
    return request('/auth/verify/resend', { method: 'POST' });
  }

  function forgotPassword(email) {
    return request('/auth/forgot', { method: 'POST', body: { email: email } });
  }

  function resetPassword(token, password) {
    return request('/auth/reset', { method: 'POST', body: { token: token, password: password } });
  }

  /* ---- second factor ---- */

  function setupTwoFactor() {
    return request('/auth/2fa/setup', { method: 'POST' });
  }

  function enableTwoFactor(code) {
    return request('/auth/2fa/enable', { method: 'POST', body: { code: code } });
  }

  function disableTwoFactor(password, code) {
    return request('/auth/2fa/disable', { method: 'POST', body: { password: password, code: code } });
  }

  /* ---- OAuth ---- */

  function oauthProviders() {
    return request('/auth/oauth/providers').catch(function (err) {
      if (err.status === 404) return { providers: [] };
      throw err;
    });
  }

  function oauthStart(provider) {
    return request('/auth/oauth/' + encodeURIComponent(provider) + '/start').then(function (data) {
      if (data && data.url) window.location.href = data.url;
      return data;
    });
  }

  function oauthExchange(code) {
    return request('/auth/oauth/exchange', { method: 'POST', body: { code: code } })
      .then(function (data) {
        setSession(data.token, data.user);
        return data.user;
      });
  }

  /* ---- sessions ---- */

  function sessions() {
    return request('/auth/sessions').then(function (data) { return data.sessions || []; });
  }

  function revokeSession(jti) {
    return request('/auth/sessions/' + encodeURIComponent(jti), { method: 'DELETE' });
  }

  function changePassword(currentPassword, newPassword) {
    return request('/auth/password', { method: 'POST', body: { currentPassword: currentPassword, newPassword: newPassword } })
      .then(function (data) {
        setSession('', null);
        return data;
      });
  }

  /* ------------------------------------------------------------ local data */

  function hashString(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function localSnapshot() {
    var store = ls();
    var out = {};
    if (!store) return out;
    for (var i = 0; i < store.length; i++) {
      var key = store.key(i);
      if (!key || !LOCAL_KEY_RE.test(key) || NEVER_SYNC[key]) continue;
      var raw = store.getItem(key);
      if (raw === null || raw === undefined) continue;
      if (raw.length > 900000) continue; // server limit is 1 MB per document
      var value;
      try { value = JSON.parse(raw); } catch (e) { value = raw; }
      out[key] = { value: value, hash: hashString(raw), bytes: raw.length };
    }
    return out;
  }

  function metaKey() {
    return META_PREFIX + (state.user && state.user.id ? state.user.id : 'anonymous');
  }

  function readMeta() {
    var meta = readJSON(metaKey(), null);
    if (!meta || typeof meta !== 'object') meta = { hashes: {}, ts: {}, syncedAt: 0 };
    if (!meta.hashes) meta.hashes = {};
    if (!meta.ts) meta.ts = {};
    return meta;
  }

  function writeMeta(meta) {
    writeJSON(metaKey(), meta);
  }

  function cloudSnapshot() {
    return request('/sync/all').then(function (data) {
      var map = {};
      (data.documents || []).forEach(function (doc) {
        var raw = JSON.stringify(doc.value);
        map[doc.key] = { value: doc.value, updatedAt: doc.updatedAt, version: doc.version, hash: hashString(raw) };
      });
      return map;
    });
  }

  /* ------------------------------------------------------------ sync core */

  function planSync(local, cloud, meta, resolve) {
    var plan = { push: [], pull: [], conflicts: [], needsDecision: false };
    var keys = Object.keys(local).concat(Object.keys(cloud).filter(function (k) { return !local[k]; }));

    var localCount = Object.keys(local).length;
    var cloudCount = Object.keys(cloud).length;

    // First contact between this device and this account: never guess.
    if (!meta.syncedAt && localCount && cloudCount && !resolve) {
      plan.needsDecision = true;
      plan.localCount = localCount;
      plan.cloudCount = cloudCount;
      return plan;
    }
    if (!meta.syncedAt && resolve === 'cloud') {
      Object.keys(cloud).forEach(function (key) { plan.pull.push(key); });
      return plan;
    }
    if (!meta.syncedAt && resolve === 'local') {
      Object.keys(local).forEach(function (key) { plan.push.push(key); });
      return plan;
    }

    keys.forEach(function (key) {
      var l = local[key];
      var c = cloud[key];
      var lastHash = meta.hashes[key];
      var localChanged = !!l && l.hash !== lastHash;
      var cloudChanged = !!c && c.updatedAt > (meta.ts[key] || 0);

      if (localChanged && !cloudChanged) { plan.push.push(key); return; }
      if (!localChanged && cloudChanged) { plan.pull.push(key); return; }
      if (localChanged && cloudChanged) {
        // Both moved since the last sync. Newer wins; the loser is kept in the
        // conflict list so the account page can show exactly what happened.
        var localTs = meta.localTs && meta.localTs[key] ? meta.localTs[key] : meta.syncedAt || 0;
        if (localTs > c.updatedAt) { plan.push.push(key); plan.conflicts.push({ key: key, winner: 'device' }); }
        else { plan.pull.push(key); plan.conflicts.push({ key: key, winner: 'cloud' }); }
      }
    });
    return plan;
  }

  function applyPull(cloudMap, keys) {
    var store = ls();
    if (!store) return 0;
    var applied = 0;
    keys.forEach(function (key) {
      var doc = cloudMap[key];
      if (!doc) return;
      try {
        var raw = typeof doc.value === 'string' ? doc.value : JSON.stringify(doc.value);
        store.setItem(key, raw);
        applied++;
      } catch (e) { /* quota: leave the older local value */ }
    });
    return applied;
  }

  function syncNow(options) {
    var opts = options || {};
    if (!state.token) {
      return Promise.reject(Object.assign(new Error('Sign in to TaxMitra Cloud first.'), { code: 'NOT_SIGNED_IN' }));
    }
    if (state.syncing) {
      return Promise.reject(Object.assign(new Error('A sync is already running.'), { code: 'SYNC_BUSY' }));
    }
    state.syncing = true;
    emit('status', status());

    var meta = readMeta();
    var local = localSnapshot();
    var cloudMap;

    return cloudSnapshot().then(function (map) {
      cloudMap = map;
      var plan = planSync(local, cloudMap, meta, opts.resolve);
      if (plan.needsDecision) {
        var decisionErr = new Error('This device and the cloud both hold data for this account. Choose which copy to keep.');
        decisionErr.code = 'SYNC_DECISION_REQUIRED';
        decisionErr.plan = { localCount: plan.localCount, cloudCount: plan.cloudCount };
        throw decisionErr;
      }

      var pushed = 0;
      var pulled = 0;

      var pushStep = plan.push.length
        ? request('/sync/bulk', {
            method: 'POST',
            body: {
              docs: plan.push.map(function (key) {
                return { key: key, value: local[key].value, updatedAt: Date.now() };
              }),
            },
          }).then(function (result) {
            pushed = result.applied || 0;
            (result.documents || []).forEach(function (doc) {
              var key = doc.key;
              if (local[key]) meta.hashes[key] = local[key].hash;
              meta.ts[key] = doc.updatedAt;
            });
          })
        : Promise.resolve();

      return pushStep.then(function () {
        pulled = applyPull(cloudMap, plan.pull);
        plan.pull.forEach(function (key) {
          var doc = cloudMap[key];
          meta.hashes[key] = doc.hash;
          meta.ts[key] = doc.updatedAt;
        });
        meta.syncedAt = Date.now();
        meta.lastResult = { pushed: pushed, pulled: pulled, conflicts: plan.conflicts };
        writeMeta(meta);
        state.lastSync = meta.syncedAt;
        state.lastError = null;
        return meta.lastResult;
      });
    }).then(function (result) {
      state.syncing = false;
      emit('synced', result);
      emit('status', status());
      return result;
    }).catch(function (err) {
      state.syncing = false;
      state.lastError = err;
      emit('error', err);
      emit('status', status());
      throw err;
    });
  }

  function startAuto(intervalMs) {
    stopAuto();
    state.autoTimer = setInterval(function () {
      if (!state.token || state.syncing) return;
      syncNow().catch(function () { /* surfaced through the error event */ });
    }, intervalMs || 30000);
    if (state.autoTimer.unref) state.autoTimer.unref();
  }

  function stopAuto() {
    if (state.autoTimer) { clearInterval(state.autoTimer); state.autoTimer = null; }
  }

  function status() {
    var meta = readMeta();
    return {
      available: state.available,
      signedIn: !!state.token,
      user: state.user,
      syncing: state.syncing,
      lastSync: meta.syncedAt || null,
      lastResult: meta.lastResult || null,
      lastError: state.lastError ? { code: state.lastError.code, message: state.lastError.message } : null,
      health: state.health,
    };
  }

  /* ------------------------------------------------------------------ AI */

  function aiChat(messages, options) {
    var opts = options || {};
    return request('/ai/chat', {
      method: 'POST',
      body: { messages: messages, mode: opts.mode || 'general', lang: opts.lang || 'hi' },
      timeout: 60000,
    }).then(function (data) {
      return { text: data.text, provider: data.provider, model: data.model, usage: data.usage };
    });
  }

  function aiStatus() {
    return request('/ai/status').catch(function (err) {
      if (err.status === 404) return { configured: false, providers: [], note: 'This build has no AI endpoint.' };
      throw err;
    });
  }

  /* ------------------------------------------------------------ government */

  function govtStatus() {
    return request('/govt/status');
  }

  function generateIrn(invoice) {
    return request('/govt/einvoice/irn', { method: 'POST', body: { invoice: invoice }, timeout: 60000 });
  }

  function fileGstReturn(returnType, payload) {
    return request('/govt/gst-return', { method: 'POST', body: { returnType: returnType, payload: payload }, timeout: 60000 });
  }

  /* ---------------------------------------------------------------- boot */

  function boot() {
    restore();
    probe().then(function (available) {
      if (available && state.token) {
        me().then(function () {
          startAuto(30000);
        }).catch(function (err) {
          if (err.status === 401) setSession('', null);
        });
      }
      emit('status', status());
    });
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && state.token && state.available) {
          syncNow().catch(function () { /* ignore */ });
        }
      });
    }
  }

  /* Auto-boot on any page that loads this file, so the AI proxy turns itself on
     the moment a server with a key is present. Opt out with
     window.TAXMITRA_NO_CLOUD_AUTOBOOT = true. */
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (!window.TAXMITRA_NO_CLOUD_AUTOBOOT) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { try { boot(); } catch (e) { /* never break a page */ } });
      } else {
        setTimeout(function () { try { boot(); } catch (e) { /* never break a page */ } }, 0);
      }
    }
  }

  return {
    // state
    get available() { return state.available; },
    get user() { return state.user; },
    get token() { return state.token; },
    state: state,
    boot: boot,
    probe: probe,
    status: status,
    on: on,
    // auth
    register: register,
    login: login,
    logout: logout,
    me: me,
    changePassword: changePassword,
    // account lifecycle
    verifyEmail: verifyEmail,
    resendVerification: resendVerification,
    forgotPassword: forgotPassword,
    resetPassword: resetPassword,
    // 2FA
    setupTwoFactor: setupTwoFactor,
    enableTwoFactor: enableTwoFactor,
    disableTwoFactor: disableTwoFactor,
    // OAuth
    oauthProviders: oauthProviders,
    oauthStart: oauthStart,
    oauthExchange: oauthExchange,
    // sessions
    sessions: sessions,
    revokeSession: revokeSession,
    restore: restore,
    // sync
    syncNow: syncNow,
    startAuto: startAuto,
    stopAuto: stopAuto,
    localSnapshot: localSnapshot,
    // ai
    aiChat: aiChat,
    aiStatus: aiStatus,
    enableAiProxy: enableAiProxy,
    // government
    govtStatus: govtStatus,
    generateIrn: generateIrn,
    fileGstReturn: fileGstReturn,
    // internals exposed for tests
    _internals: { hashString: hashString, planSync: planSync, apiBase: apiBase, geminiToMessages: geminiToMessages },
  };
});
