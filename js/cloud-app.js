/* ============================================================
   TaxMitra Cloud page controller
   Depends on: js/cloud.js (TMCloud). Never invents a status:
   every line rendered here comes from the server or is labelled
   as "not available".
   ============================================================ */
(function () {
  'use strict';

  var C = window.TMCloud;

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(message, type) {
    var host = $('toastHost');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'tm-toast ' + (type || 'info');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 300);
    }, 4200);
  }

  function show(el, visible) {
    if (el) el.style.display = visible ? '' : 'none';
  }

  function alertText(id, message) {
    var el = $(id);
    if (!el) return;
    if (message) { el.textContent = message; el.style.display = ''; }
    else { el.textContent = ''; el.style.display = 'none'; }
  }

  function bytes(n) {
    var value = Number(n) || 0;
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
    return (value / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function when(ts) {
    if (!ts) return 'Never on this device';
    try {
      return new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return new Date(ts).toString();
    }
  }

  /* --------------------------------------------------- URL round-trips */

  function resetToken() {
    try {
      return new URLSearchParams(window.location.search).get('reset') || '';
    } catch (e) { return ''; }
  }

  function clearResetToken() {
    try {
      window.history.replaceState({}, '', window.location.pathname);
    } catch (e) { /* ignore */ }
  }

  function consumeUrlState() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }

    handleRecoverLink(params);

    if (params.get('reset')) {
      var panel = $('resetPanel');
      if (panel) panel.hidden = false;
      var signedOut = $('signedOutView');
      if (signedOut) signedOut.hidden = true;
      var focus = $('resetPassword');
      if (focus) focus.focus();
    }

    if (params.get('verify')) {
      toast(params.get('verify') === 'ok' ? 'Email confirmed.' : 'That confirmation link was invalid or already used.',
        params.get('verify') === 'ok' ? 'ok' : 'bad');
      clearResetToken();
    }

    if (params.get('oauth')) {
      var result = params.get('oauth');
      if (result !== 'ok') {
        var reasons = {
          cancelled: 'Sign-in was cancelled at the provider.',
          state_invalid: 'That sign-in attempt expired. Please try again.',
          exchange_failed: 'The provider did not accept the sign-in. Check the OAuth app settings.',
          email_missing: 'The provider did not share a verified email address.',
          email_unverified: 'That email is not verified by the provider, so it cannot be linked automatically.',
        };
        toast(reasons[result] || 'Sign-in failed.', 'bad');
      }
      clearResetToken();
    }

    var hash = String(window.location.hash || '').replace(/^#/, '');
    if (!hash) return;
    var fragment;
    try { fragment = new URLSearchParams(hash); } catch (e) { return; }
    var code = fragment.get('code');
    if (!code || !C) return;
    window.history.replaceState({}, '', window.location.pathname);
    C.oauthExchange(code).then(function (user) {
      toast('Signed in as ' + user.email, 'ok');
      C.startAuto(30000);
      renderAll();
      return C.syncNow().catch(handleSyncError);
    }).catch(function (err) {
      toast(err.message || 'That sign-in code was already used.', 'bad');
    });
  }

  /* ----------------------------------------------------------- passkeys */

  function b64uToBuffer(value) {
    var str = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    var pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
    var binary = atob(str + pad);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function bufferToB64u(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function passkeySupported() {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential &&
      !!(navigator.credentials && navigator.credentials.create);
  }

  function describePasskeyError(err) {
    if (!err) return 'The passkey operation failed.';
    if (err.name === 'NotAllowedError') return 'The passkey prompt was cancelled or timed out.';
    if (err.name === 'InvalidStateError') return 'That authenticator is already registered for this account.';
    if (err.name === 'SecurityError') return 'The browser refused: this page must be served over HTTPS with a matching domain.';
    if (err.name === 'NotSupportedError') return 'This browser or device does not support that passkey type.';
    return err.message || 'The passkey operation failed.';
  }

  function addPasskey() {
    if (!C) return;
    if (!passkeySupported()) {
      alertText('passkeyError', 'This browser cannot create passkeys. Use a current Chrome, Edge, Safari or Firefox over HTTPS.');
      return;
    }
    var btn = $('addPasskeyBtn');
    if (btn) btn.disabled = true;
    alertText('passkeyError', null);
    alertText('passkeyMessage', null);

    C.passkeyRegisterOptions().then(function (data) {
      var publicKey = data.publicKey;
      publicKey.challenge = b64uToBuffer(publicKey.challenge);
      publicKey.user.id = b64uToBuffer(publicKey.user.id);
      publicKey.excludeCredentials = (publicKey.excludeCredentials || []).map(function (cred) {
        return { type: 'public-key', id: b64uToBuffer(cred.id) };
      });
      return navigator.credentials.create({ publicKey: publicKey });
    }).then(function (credential) {
      if (!credential) throw new Error('No credential was created.');
      var transports = credential.response.getTransports ? credential.response.getTransports() : [];
      return C.passkeyRegisterVerify({
        id: credential.id,
        rawId: bufferToB64u(credential.rawId),
        type: credential.type,
        transports: transports,
        response: {
          clientDataJSON: bufferToB64u(credential.response.clientDataJSON),
          attestationObject: bufferToB64u(credential.response.attestationObject),
        },
      }, ($('passkeyName') || {}).value || 'Passkey');
    }).then(function (data) {
      alertText('passkeyMessage', data.message || 'Passkey added.');
      toast('Passkey added.', 'ok');
      renderPasskeys();
      renderSecurity();
    }).catch(function (err) {
      alertText('passkeyError', describePasskeyError(err));
    }).then(function () { if (btn) btn.disabled = false; });
  }

  function loginWithPasskey() {
    if (!C) return;
    if (!passkeySupported()) {
      alertText('passkeyLoginError', 'This browser cannot use passkeys.');
      return;
    }
    var email = ($('passkeyEmail') || {}).value || '';
    var btn = $('passkeyLoginBtn');
    if (btn) btn.disabled = true;
    alertText('passkeyLoginError', null);

    C.passkeyLoginOptions(email.trim()).then(function (data) {
      var publicKey = data.publicKey;
      publicKey.challenge = b64uToBuffer(publicKey.challenge);
      publicKey.allowCredentials = (publicKey.allowCredentials || []).map(function (cred) {
        return { type: 'public-key', id: b64uToBuffer(cred.id), transports: cred.transports };
      });
      return navigator.credentials.get({ publicKey: publicKey });
    }).then(function (credential) {
      if (!credential) throw new Error('No passkey was returned.');
      return C.passkeyLoginVerify({
        id: credential.id,
        rawId: bufferToB64u(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToB64u(credential.response.clientDataJSON),
          authenticatorData: bufferToB64u(credential.response.authenticatorData),
          signature: bufferToB64u(credential.response.signature),
          userHandle: credential.response.userHandle ? bufferToB64u(credential.response.userHandle) : null,
        },
      }, email.trim());
    }).then(function (data) {
      toast('Signed in with a passkey.', 'ok');
      C.startAuto(30000);
      renderAll();
      return C.syncNow().catch(handleSyncError);
    }).catch(function (err) {
      alertText('passkeyLoginError', describePasskeyError(err));
    }).then(function () { if (btn) btn.disabled = false; });
  }

  function renderPasskeys() {
    var body = $('passkeyBody');
    if (!body || !C || !C.user) return;
    C.passkeys().then(function (list) {
      if (!list.length) {
        body.innerHTML = '<tr><td colspan="4" class="muted-note">No passkey yet. Add one below — after that you can sign in without a password.</td></tr>';
        return;
      }
      body.innerHTML = list.map(function (p) {
        return '<tr>' +
          '<td>' + esc(p.name || 'Passkey') + '</td>' +
          '<td>' + esc(when(p.createdAt)) + '</td>' +
          '<td>' + esc(p.lastUsed ? when(p.lastUsed) : 'never') + '</td>' +
          '<td><button class="btn-secondary-solid" type="button" data-passkey="' + esc(p.id) + '">Remove</button></td>' +
          '</tr>';
      }).join('');
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="4" class="muted-note">' + esc(err.message || 'Could not read passkeys.') + '</td></tr>';
    });
  }

  /* ---------------------------------------------------------- recovery */

  function handleRecoverLink(params) {
    var token = params.get('recover');
    if (!token) return;
    var panel = $('recoverPanel');
    if (panel) panel.hidden = false;
    var signedOut = $('signedOutView');
    if (signedOut) signedOut.hidden = true;
    var others = ['passkeySignInCard', 'forgotCard', 'oauthCard'];
    others.forEach(function (id) { var el = $(id); if (el) el.hidden = true; });
    if (!C) return;
    C.confirmRecovery(token).then(function (data) {
      alertText('recoverStatus', data.message || 'Email confirmed. Waiting for an administrator.');
      toast('Recovery confirmed. An administrator must approve it.', 'ok');
    }).catch(function (err) {
      alertText('recoverStatus', err.message || 'That recovery link is invalid or expired.');
    });
  }

  /* ------------------------------------------------------------ server */

  function renderServer() {
    var dot = $('serverDot');
    var text = $('serverStatus');
    var detail = $('serverDetail');
    var base = $('apiBase');
    if (base && C) base.textContent = C._internals.apiBase();

    if (!C) {
      if (dot) dot.className = 'dot off';
      if (text) text.textContent = 'The cloud client did not load.';
      if (detail) detail.textContent = 'js/cloud.js is missing from this page.';
      return;
    }
    if (C.available) {
      if (dot) dot.className = 'dot on';
      if (text) text.textContent = 'Connected to a TaxMitra server.';
      var health = C.state.health || {};
      var caps = health.capabilities || {};
      if (detail) {
        detail.textContent = 'Storage: ' + (health.storage || 'unknown') +
          ' · Accounts: ' + (caps.accounts ? 'on' : 'off') +
          ' · Sync: ' + (caps.cloudSync ? 'on' : 'off') +
          ' · AI: ' + (caps.ai ? 'on' : 'rule engine') +
          ' · Version: ' + (health.version || '—');
      }
    } else {
      if (dot) dot.className = 'dot off';
      if (text) text.textContent = 'No TaxMitra server is answering.';
      if (detail) {
        detail.textContent = 'This build is running as a static site, so accounts and sync are off. Everything else (billing, ITR wizard, calculators) still works and stays in this browser. To turn the server on, run "npm start" locally or deploy it — see BACKEND_SETUP.md.';
      }
    }
  }

  /* -------------------------------------------------------------- views */

  function renderViews() {
    var signedIn = !!(C && C.user);
    show($('signedOutView'), !signedIn);
    show($('signedInView'), signedIn);
    if (!signedIn) return;

    var user = C.user || {};
    var el = $('profileEmail');
    if (el) el.textContent = user.email || '—';
    el = $('profileRole');
    if (el) el.textContent = user.role || 'user';

    var local = C.localSnapshot();
    var localKeys = Object.keys(local);
    var localBytes = localKeys.reduce(function (sum, key) { return sum + (local[key].bytes || 0); }, 0);
    el = $('localSummary');
    if (el) el.textContent = localKeys.length + ' documents · ' + bytes(localBytes) + (localKeys.length ? ' · ' + localKeys.slice(0, 4).join(', ') + (localKeys.length > 4 ? '…' : '') : '');

    var status = C.status();
    el = $('lastSync');
    if (el) el.textContent = when(status.lastSync);
    if (status.lastResult) {
      renderResult(status.lastResult);
    }
  }

  function renderCloudUsage() {
    if (!C || !C.user) return;
    C.probe().then(function () {
      if (!C.available) return;
      return C.me().then(function (data) {
        var el = $('cloudSummary');
        if (el) el.textContent = data.storage.documents + ' documents · ' + bytes(data.storage.bytes) + ' of ' + bytes(data.storage.quota || 0);
        el = $('profileUsage');
        if (el) el.textContent = bytes(data.storage.bytes) + ' used of ' + bytes(data.storage.quota || 0);
      });
    }).catch(function () {
      var el = $('cloudSummary');
      if (el) el.textContent = 'Could not read cloud usage.';
    });
  }

  function renderResult(result) {
    var el = $('syncResult');
    if (!el || !result) return;
    var parts = ['Pushed ' + (result.pushed || 0) + ' · Pulled ' + (result.pulled || 0)];
    if (result.conflicts && result.conflicts.length) {
      parts.push(result.conflicts.length + ' conflict(s) resolved: ' + result.conflicts.map(function (c) {
        return c.key + ' → ' + (c.winner === 'cloud' ? 'cloud' : 'this device');
      }).join(', '));
    }
    el.textContent = parts.join(' · ');
    el.style.display = '';
  }

  function setBusy(busy) {
    ['syncNowBtn', 'pushLocalBtn', 'pullCloudBtn'].forEach(function (id) {
      var btn = $(id);
      if (btn) btn.disabled = !!busy;
    });
    var state = $('syncState');
    if (state) state.textContent = busy ? 'Syncing…' : 'Idle';
  }

  function handleSyncError(err) {
    setBusy(false);
    var panel = $('decisionPanel');
    if (err && err.code === 'SYNC_DECISION_REQUIRED' && err.plan) {
      if (panel) {
        panel.style.display = '';
        var t = $('decisionText');
        if (t) t.textContent = 'This device has ' + err.plan.localCount + ' documents; the account has ' + err.plan.cloudCount + '.';
      }
      alertText('syncError', null);
      return;
    }
    if (panel) panel.style.display = 'none';
    alertText('syncResult', null);
    alertText('syncError', (err && err.message) || 'Sync failed.');
    toast((err && err.message) || 'Sync failed.', 'bad');
  }

  function runSync(options) {
    if (!C || !C.user) { toast('Sign in first.', 'warn'); return; }
    alertText('syncError', null);
    alertText('syncResult', null);
    if ($('decisionPanel')) $('decisionPanel').style.display = 'none';
    setBusy(true);
    C.syncNow(options).then(function (result) {
      setBusy(false);
      renderResult(result);
      renderCloudUsage();
      renderViews();
      toast('Synced: ' + (result.pushed || 0) + ' up, ' + (result.pulled || 0) + ' down.', 'ok');
    }).catch(handleSyncError);
  }

  function renderOAuth() {
    var host = $('oauthButtons');
    var note = $('oauthNote');
    if (!host) return;
    if (!C || !C.available) {
      host.innerHTML = '<span class="muted-note">No server is answering, so OAuth sign-in is unavailable.</span>';
      return;
    }
    C.oauthProviders().then(function (data) {
      var providers = data.providers || [];
      if (!providers.length) {
        host.innerHTML = '<span class="muted-note">No provider is configured on this server. Set GITHUB_OAUTH_CLIENT_ID/GITHUB_OAUTH_CLIENT_SECRET or the Google pair, plus OAUTH_BASE_URL.</span>';
        if (note) note.textContent = '';
        return;
      }
      host.innerHTML = providers.map(function (p) {
        return '<button class="btn-secondary-solid" type="button" data-provider="' + esc(p.id) + '">Continue with ' + esc(p.label) + '</button>';
      }).join('');
      if (note) {
        note.textContent = (data.baseUrl
          ? 'Callback base: ' + data.baseUrl
          : 'OAUTH_BASE_URL is not set, so callbacks would be misconfigured.') +
          ' The provider app must allow this exact callback URL.';
      }
    }).catch(function (err) {
      host.innerHTML = '<span class="muted-note">' + esc(err.message || 'Could not read the provider list.') + '</span>';
    });
  }

  function renderSecurity() {
    if (!C || !C.user) return;
    C.me().then(function (data) {
      var security = data.security || {};

      var emailEl = $('emailStatus');
      if (emailEl) {
        emailEl.textContent = security.emailVerified
          ? 'Confirmed ✓'
          : (security.emailConfigured
            ? 'Not confirmed yet — check your inbox, or resend below.'
            : 'Not confirmed. Email delivery is not configured on this server, so no message can be sent.');
      }
      var verifyActions = $('verifyActions');
      if (verifyActions) verifyActions.hidden = !!security.emailVerified || !security.emailConfigured;

      var twoEl = $('twoFactorStatus');
      if (twoEl) twoEl.textContent = security.twoFactor ? 'On (authenticator app)' : 'Off — password alone is enough to sign in';

      var off = $('twoFactorOff');
      if (off) off.hidden = !!security.twoFactor;
      var disable = $('twoFactorDisable');
      if (disable) disable.hidden = !security.twoFactor;

      var identityEl = $('identityStatus');
      if (identityEl) {
        var methods = ['password'].concat((data.identities || []).map(function (i) { return i.provider; }));
        identityEl.textContent = methods.filter(function (m, i) { return methods.indexOf(m) === i; }).join(', ');
      }

      var storage = $('profileUsage');
      if (storage && data.storage) storage.textContent = bytes(data.storage.bytes) + ' used of ' + bytes(data.storage.quota || 0);

      var adminLink = $('adminLink');
      if (adminLink) adminLink.hidden = !(data.user && data.user.role === 'admin');

      renderPasskeys();
      return C.sessions();
    }).then(function (sessions) {
      var body = $('sessionBody');
      if (!body || !sessions) return;
      if (!sessions.length) {
        body.innerHTML = '<tr><td colspan="4" class="muted-note">No sessions recorded.</td></tr>';
        return;
      }
      body.innerHTML = sessions.map(function (s) {
        var expired = Number(s.expiresAt) <= Date.now();
        var state = s.current ? 'This device' : (s.revoked || expired ? 'Ended' : 'Active');
        return '<tr>' +
          '<td>' + esc(when(s.createdAt)) + '</td>' +
          '<td>' + esc(when(s.expiresAt)) + '</td>' +
          '<td>' + esc(s.device || '—') + ' · ' + esc(state) + '</td>' +
          '<td>' + (s.current || s.revoked || expired
            ? '<span class="muted-note">—</span>'
            : '<button class="btn-secondary-solid" type="button" data-jti="' + esc(s.id) + '">Sign out</button>') + '</td>' +
          '</tr>';
      }).join('');
    }).catch(function (err) {
      alertText('sessionError', err.message || 'Could not read the session list.');
    });
  }

  /* ---------------------------------------------------------------- AI */

  function renderAi() {
    var dot = $('aiDot');
    var text = $('aiStatus');
    var detail = $('aiDetail');
    if (!C || !C.available) {
      if (dot) dot.className = 'dot off';
      if (text) text.textContent = 'No server, so no server-side AI.';
      if (detail) detail.textContent = 'The site keeps using its offline rule engine, which is labelled as rule-based.';
      return;
    }
    C.aiStatus().then(function (data) {
      if (data.configured) {
        if (dot) dot.className = 'dot on';
        if (text) text.textContent = 'Real AI is on for every visitor.';
        if (detail) detail.textContent = 'Providers: ' + data.providers.map(function (p) { return p.id + ' (' + p.model + ')'; }).join(', ') + '. Keys stay on the server.';
      } else {
        if (dot) dot.className = 'dot warn';
        if (text) text.textContent = 'No AI key on the server yet.';
        if (detail) detail.textContent = 'Set GEMINI_API_KEY or OPENROUTER_API_KEY (or GROQ_API_KEY / OPENAI_API_KEY) and restart. Until then answers come from the offline rule engine.';
      }
    }).catch(function (err) {
      if (dot) dot.className = 'dot off';
      if (text) text.textContent = 'Could not read AI status.';
      if (detail) detail.textContent = err.message || '';
    });
  }

  /* ---------------------------------------------------------- government */

  function renderGovt() {
    var body = $('govtBody');
    if (!body) return;
    if (!C || !C.available) {
      body.innerHTML = '<tr><td colspan="3" class="muted-note">No server is answering, so no government adapter is available. This static build cannot file anything.</td></tr>';
      return;
    }
    C.govtStatus().then(function (data) {
      var rows = [
        {
          name: 'E-invoice IRN (NIC IRP)',
          available: data.einvoice.available,
          reason: data.einvoice.available ? ('Configured against ' + data.einvoice.base + ' (' + data.env + ').') : data.einvoice.reason,
        },
        {
          name: 'GST returns (GSTR-1 / 3B / 9)',
          available: data.gstReturns.available,
          reason: data.gstReturns.available ? 'GSP credentials present.' : data.gstReturns.reason,
        },
        {
          name: 'Income-tax return filing',
          available: false,
          reason: data.incomeTaxFiling.reason,
        },
      ];
      body.innerHTML = rows.map(function (row) {
        var pill = row.available
          ? '<span class="pill yes">Available</span>'
          : '<span class="pill no">Not available</span>';
        return '<tr><td>' + esc(row.name) + '</td><td>' + pill + '</td><td class="muted-note">' + esc(row.reason || '') + '</td></tr>';
      }).join('');
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="3" class="muted-note">Could not read government status: ' + esc(err.message) + '</td></tr>';
    });
  }

  /* ------------------------------------------------------------- events */

  function wire() {
    var regForm = $('registerForm');
    if (regForm) {
      regForm.addEventListener('submit', function (event) {
        event.preventDefault();
        alertText('regError', null);
        if (!C || !C.available) { alertText('regError', 'No TaxMitra server is answering, so an account cannot be created here.'); return; }
        var btn = $('registerBtn');
        if (btn) btn.disabled = true;
        C.register(($('regEmail') || {}).value, ($('regPassword') || {}).value, ($('regName') || {}).value)
          .then(function (user) {
            regForm.reset();
            toast('Account created for ' + user.email, 'ok');
            renderAll();
          })
          .catch(function (err) { alertText('regError', err.message || 'Could not create the account.'); })
          .then(function () { if (btn) btn.disabled = false; });
      });
    }

    var loginForm = $('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', function (event) {
        event.preventDefault();
        alertText('loginError', null);
        if (!C || !C.available) { alertText('loginError', 'No TaxMitra server is answering, so sign-in is unavailable.'); return; }
        var btn = $('loginBtn');
        if (btn) btn.disabled = true;
        var second = {};
        var code = ($('loginTotp') || {}).value || '';
        if (code.trim()) {
          if (/^\d{6}$/.test(code.trim())) second.totp = code.trim();
          else second.backupCode = code.trim();
        }
        C.login(($('loginEmail') || {}).value, ($('loginPassword') || {}).value, second)
          .then(function (user) {
            loginForm.reset();
            var wrap = $('loginTotpWrap');
            if (wrap) wrap.hidden = true;
            toast('Signed in as ' + user.email, 'ok');
            C.startAuto(30000);
            renderAll();
            return C.syncNow().then(function (result) { renderResult(result); renderCloudUsage(); })
              .catch(handleSyncError);
          })
          .catch(function (err) {
            if (err.code === 'TOTP_REQUIRED') {
              var wrap = $('loginTotpWrap');
              if (wrap) { wrap.hidden = false; var input = $('loginTotp'); if (input) input.focus(); }
              alertText('loginError', 'This account has two-factor on. Enter the 6-digit code from your authenticator app.');
            } else if (err.code === 'TOTP_INVALID') {
              alertText('loginError', 'That two-factor code is not valid. Try the current code, or one of your backup codes.');
            } else {
              alertText('loginError', err.message || 'Could not sign in.');
            }
          })
          .then(function () { if (btn) btn.disabled = false; });
      });
    }

    /* ---- one-click sign-in ---- */
    var oauthButtons = $('oauthButtons');
    if (oauthButtons) {
      oauthButtons.addEventListener('click', function (event) {
        var target = event.target.closest('[data-provider]');
        if (!target || !C) return;
        target.disabled = true;
        C.oauthStart(target.getAttribute('data-provider')).catch(function (err) {
          target.disabled = false;
          if (oauthButtons.parentNode) {
            var note = $('oauthNote');
            if (note) note.textContent = err.message || 'That provider is not configured.';
          }
        });
      });
    }

    /* ---- forgot password ---- */
    var forgotForm = $('forgotForm');
    if (forgotForm) {
      forgotForm.addEventListener('submit', function (event) {
        event.preventDefault();
        alertText('forgotError', null);
        alertText('forgotMessage', null);
        if (!C || !C.available) { alertText('forgotError', 'No TaxMitra server is answering.'); return; }
        var btn = $('forgotBtn');
        if (btn) btn.disabled = true;
        C.forgotPassword(($('forgotEmail') || {}).value)
          .then(function (data) { alertText('forgotMessage', data.message || 'Check your email.'); })
          .catch(function (err) { alertText('forgotError', err.message || 'Could not send the reset link.'); })
          .then(function () { if (btn) btn.disabled = false; });
      });
    }

    /* ---- reset from the emailed link ---- */
    var resetForm = $('resetForm');
    if (resetForm) {
      resetForm.addEventListener('submit', function (event) {
        event.preventDefault();
        alertText('resetError', null);
        alertText('resetOk', null);
        var first = ($('resetPassword') || {}).value || '';
        var second = ($('resetPassword2') || {}).value || '';
        if (first !== second) { alertText('resetError', 'The two passwords do not match.'); return; }
        var token = resetToken();
        if (!token) { alertText('resetError', 'This reset link is missing its token. Request a new link.'); return; }
        C.resetPassword(token, first)
          .then(function (data) {
            clearResetToken();
            alertText('resetOk', data.message || 'Password changed.');
            resetForm.reset();
            setTimeout(function () { window.location.href = 'cloud.html'; }, 2200);
          })
          .catch(function (err) { alertText('resetError', err.message || 'Could not reset the password.'); });
      });
    }

    /* ---- two-factor ---- */
    var totpStart = $('totpStartBtn');
    if (totpStart) {
      totpStart.addEventListener('click', function () {
        alertText('totpError', null);
        totpStart.disabled = true;
        C.setupTwoFactor().then(function (data) {
          var setup = $('twoFactorSetup');
          if (setup) setup.hidden = false;
          var secret = $('totpSecret');
          if (secret) secret.textContent = (data.secret || '').replace(/(.{4})/g, '$1 ').trim();
          var uri = $('totpUri');
          if (uri) uri.textContent = data.otpauth || '';
          var code = $('totpEnableCode');
          if (code) code.focus();
        }).catch(function (err) {
          alertText('totpError', err.message || 'Could not start two-factor setup.');
        }).then(function () { totpStart.disabled = false; });
      });
    }

    var totpCancel = $('totpCancelBtn');
    if (totpCancel) {
      totpCancel.addEventListener('click', function () {
        var setup = $('twoFactorSetup');
        if (setup) setup.hidden = true;
      });
    }

    var totpEnable = $('totpEnableBtn');
    if (totpEnable) {
      totpEnable.addEventListener('click', function () {
        alertText('totpError', null);
        totpEnable.disabled = true;
        C.enableTwoFactor(($('totpEnableCode') || {}).value || '')
          .then(function (data) {
            alertText('totpBackupCodes', 'Two-factor is on. Backup codes (each works once): ' + data.backupCodes.join('  '));
            var setup = $('twoFactorSetup');
            if (setup) setup.hidden = true;
            renderSecurity();
            toast('Two-factor enabled. Save the backup codes.', 'ok');
          })
          .catch(function (err) { alertText('totpError', err.message || 'Could not enable two-factor.'); })
          .then(function () { totpEnable.disabled = false; });
      });
    }

    var totpDisable = $('totpDisableBtn');
    if (totpDisable) {
      totpDisable.addEventListener('click', function () {
        alertText('totpDisableError', null);
        totpDisable.disabled = true;
        C.disableTwoFactor(($('totpDisablePassword') || {}).value || '', ($('totpDisableCode') || {}).value || '')
          .then(function () {
            toast('Two-factor is off.', 'info');
            renderSecurity();
          })
          .catch(function (err) { alertText('totpDisableError', err.message || 'Could not disable two-factor.'); })
          .then(function () { totpDisable.disabled = false; });
      });
    }

    var addPasskeyBtn = $('addPasskeyBtn');
    if (addPasskeyBtn) addPasskeyBtn.addEventListener('click', addPasskey);

    var passkeyLoginBtn = $('passkeyLoginBtn');
    if (passkeyLoginBtn) passkeyLoginBtn.addEventListener('click', loginWithPasskey);

    var passkeyBodyEl = $('passkeyBody');
    if (passkeyBodyEl) {
      passkeyBodyEl.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-passkey]');
        if (!btn || !C) return;
        if (!window.confirm('Remove this passkey? Any device using it will stop working.')) return;
        btn.disabled = true;
        C.deletePasskey(btn.getAttribute('data-passkey'))
          .then(function () { renderPasskeys(); renderSecurity(); toast('Passkey removed.', 'info'); })
          .catch(function (err) { alertText('passkeyError', err.message); btn.disabled = false; });
      });
    }

    var recoverForm = $('recoverForm');
    if (recoverForm) {
      recoverForm.addEventListener('submit', function (event) {
        event.preventDefault();
        alertText('recoverError', null);
        alertText('recoverMessage', null);
        if (!C || !C.available) { alertText('recoverError', 'No TaxMitra server is answering.'); return; }
        var btn = $('recoverBtn');
        if (btn) btn.disabled = true;
        C.requestRecovery(($('recoverEmail') || {}).value)
          .then(function (data) { alertText('recoverMessage', data.message || 'Check your email.'); })
          .catch(function (err) { alertText('recoverError', err.message || 'Could not start recovery.'); })
          .then(function () { if (btn) btn.disabled = false; });
      });
    }

    var resendVerify = $('resendVerifyBtn');
    if (resendVerify) {
      resendVerify.addEventListener('click', function () {
        alertText('verifyMessage', null);
        resendVerify.disabled = true;
        C.resendVerification()
          .then(function (data) { alertText('verifyMessage', data.message || (data.sent ? 'Email sent.' : 'Email is not configured on this server.')); })
          .catch(function (err) { alertText('verifyMessage', err.message || 'Could not send the email.'); })
          .then(function () { resendVerify.disabled = false; });
      });
    }

    var sessionBody = $('sessionBody');
    if (sessionBody) {
      sessionBody.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-jti]');
        if (!btn || !C) return;
        btn.disabled = true;
        C.revokeSession(btn.getAttribute('data-jti'))
          .then(function () { renderSecurity(); })
          .catch(function (err) { alertText('sessionError', err.message || 'Could not revoke that session.'); });
      });
    }

    var signOut = $('signOutBtn');
    if (signOut) {
      signOut.addEventListener('click', function () {
        C.logout().then(function () {
          toast('Signed out. Your data is still on this device.', 'info');
          renderAll();
        });
      });
    }

    var syncNow = $('syncNowBtn');
    if (syncNow) syncNow.addEventListener('click', function () { runSync(); });

    var push = $('pushLocalBtn');
    if (push) {
      push.addEventListener('click', function () {
        if (!window.confirm('Overwrite the cloud copy with this device’s documents?')) return;
        runSync({ resolve: 'local' });
      });
    }

    var pull = $('pullCloudBtn');
    if (pull) {
      pull.addEventListener('click', function () {
        if (!window.confirm('Replace the documents on this device with the cloud copy?')) return;
        runSync({ resolve: 'cloud' });
      });
    }

    var keepLocal = $('keepLocalBtn');
    if (keepLocal) {
      keepLocal.addEventListener('click', function () {
        runSync({ resolve: 'local' });
      });
    }

    var keepCloud = $('keepCloudBtn');
    if (keepCloud) {
      keepCloud.addEventListener('click', function () {
        runSync({ resolve: 'cloud' });
      });
    }

    var pwForm = $('pwForm');
    if (pwForm) {
      pwForm.addEventListener('submit', function (event) {
        event.preventDefault();
        alertText('pwError', null);
        alertText('pwResult', null);
        var btn = $('changePwBtn');
        if (btn) btn.disabled = true;
        C.changePassword(($('curPassword') || {}).value, ($('newPassword') || {}).value)
          .then(function (data) {
            pwForm.reset();
            toast('Password changed. Sign in again.', 'ok');
            renderAll();
            if (data && data.message) toast(data.message, 'info');
          })
          .catch(function (err) { alertText('pwError', err.message || 'Could not change the password.'); })
          .then(function () { if (btn) btn.disabled = false; });
      });
    }

    var recheck = $('recheckBtn');
    if (recheck) {
      recheck.addEventListener('click', function () {
        if (!C) return;
        C.state.checked = false;
        renderServer();
        C.probe().then(function () { renderAll(); toast('Checked the server again.', 'info'); });
      });
    }

    if (C && C.on) {
      C.on('error', function () { renderViews(); });
      C.on('synced', function () { renderCloudUsage(); });
    }
  }

  function renderAll() {
    renderServer();
    renderViews();
    renderOAuth();
    if (!C || !C.user) {
      var summary = $('cloudSummary');
      if (summary) summary.textContent = 'Sign in to see the cloud copy.';
    }
    renderAi();
    renderGovt();
    if (C && C.user) { renderCloudUsage(); renderSecurity(); }
  }

  function boot() {
    renderServer();
    wire();
    if (!passkeySupported()) {
      ['addPasskeyBtn', 'passkeyLoginBtn'].forEach(function (id) {
        var el = $(id);
        if (el) { el.disabled = true; el.title = 'This browser does not support passkeys'; }
      });
    }
    if (!C) return;
    C.boot();
    consumeUrlState();
    // C.boot() probes asynchronously; re-render when the probe lands.
    var started = Date.now();
    var timer = setInterval(function () {
      renderAll();
      if (C.state.checked || Date.now() - started > 8000) clearInterval(timer);
    }, 400);
    setTimeout(renderAll, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
