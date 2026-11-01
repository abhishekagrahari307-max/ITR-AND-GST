/* ===================================================
   TaxMitra – Account page (GitHub sign-in)
   Depends on: js/github-auth.js, js/tm-store.js, js/session-boot.js
   =================================================== */
(function () {
  'use strict';

  var A = window.TMGitHubAuth;
  var S = window.TMStore;

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
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
    }, 3600);
  }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = value;
  }

  var polling = { cancelled: false, timer: null };

  /* ------------------------- rendering ------------------------- */

  function render() {
    var session = A ? A.getSession() : null;
    var signedOut = $('signedOutView');
    var signedIn = $('signedInView');
    if (signedOut) signedOut.hidden = !!session;
    if (signedIn) signedIn.hidden = !session;
    if (session) renderProfile(session);
    else renderSignedOut();
    renderSetup();
  }

  function renderSignedOut() {
    var cfg = A ? A.getConfig() : { clientId: '' };
    var device = $('deviceFlowCard');
    var notice = $('clientIdNotice');
    if (notice) notice.hidden = !!cfg.clientId;
    if (device) device.disabled = !cfg.clientId;
  }

  function renderSetup() {
    var cfg = A ? A.getConfig() : { clientId: '', admins: [], repo: '' };
    var input = $('clientIdInput');
    if (input && !input.value) input.value = cfg.clientId || '';
    setText('adminLogins', cfg.admins.join(', '));
    setText('repoSlug', cfg.repo);
    var repoLink = $('repoLink');
    if (repoLink && cfg.repo) repoLink.href = 'https://github.com/' + cfg.repo;
  }

  function renderProfile(session) {
    var avatar = $('avatar');
    if (avatar) {
      avatar.src = session.avatarUrl || '';
      avatar.alt = 'GitHub avatar of ' + session.login;
    }
    setText('profileName', session.name || session.login);
    setText('profileLogin', '@' + session.login);
    setText('profileSince', String(session.signedInAt || '').replace('T', ' ').slice(0, 16));
    setText('profileStorage', session.storage === 'local' ? 'Saved in this browser until you sign out' : 'This tab only');
    setText('profileScope', session.scope || 'read:user (default)');

    var roleBadge = $('roleBadge');
    if (roleBadge) {
      roleBadge.textContent = session.role === 'admin' ? '👑 Administrator' : '👤 User';
      roleBadge.className = 'role-badge ' + (session.role === 'admin' ? 'admin' : 'user');
    }
    setText('roleReason', session.roleReason || '');
    setText('repoPermission', session.repoPermission
      ? (session.repoPermission.admin ? 'Admin on ' + session.repoPermission.fullName
        : session.repoPermission.push ? 'Write access on ' + session.repoPermission.fullName
          : 'Read-only or no access to ' + session.repoPermission.fullName)
      : 'Not checked (the token may not include repository scope)');

    var ns = A.profileId(session);
    setText('dataNamespace', ns);
    var counts = { invoices: 0, customers: 0, items: 0 };
    if (S) {
      counts.invoices = S.list('invoices').length;
      counts.customers = S.list('customers').length;
      counts.items = S.list('items').length;
    }
    setText('dataCounts', counts.invoices + ' invoices · ' + counts.customers + ' customers · ' + counts.items + ' items');

    var adminLink = $('adminLink');
    if (adminLink) {
      adminLink.hidden = session.role !== 'admin';
    }
    var claim = $('claimLocal');
    if (claim && S) {
      var legacy = (function () {
        var previous = S.getNamespace();
        S.setNamespace('');
        var n = S.list('invoices').length + S.list('customers').length + S.list('items').length;
        S.setNamespace(previous);
        return n;
      })();
      claim.hidden = legacy === 0 || ns === '';
      setText('claimLocalCount', String(legacy));
    }
  }

  /* ------------------------- device flow ------------------------- */

  function cancelPolling() {
    polling.cancelled = true;
    if (polling.timer) clearTimeout(polling.timer);
  }

  async function startDevice() {
    cancelPolling();
    polling.cancelled = false;
    var remember = $('rememberMe') ? $('rememberMe').checked : false;
    var box = $('deviceBox');
    if (box) box.hidden = false;
    setText('deviceStatus', 'Contacting GitHub…');
    var codeEl = $('userCode');
    if (codeEl) codeEl.textContent = '••••••';
    var link = $('verificationLink');
    if (link) link.removeAttribute('href');

    try {
      await A.signInWithDeviceFlow({
        remember: remember,
        onCode: function (flow) {
          if (codeEl) codeEl.textContent = flow.userCode;
          if (link) {
            link.href = flow.verificationUri;
            link.textContent = flow.verificationUri.replace('https://', '');
          }
          setText('deviceStatus', 'Waiting for you to approve the code on GitHub…');
        },
        wait: function (ms) {
          return new Promise(function (resolve) {
            polling.timer = setTimeout(resolve, ms);
          });
        }
      });
      if (polling.cancelled) return;
      toast('Signed in as ' + A.getSession().login, 'ok');
      window.location.reload();
    } catch (error) {
      if (polling.cancelled) { setText('deviceStatus', 'Cancelled.'); return; }
      setText('deviceStatus', describeError(error));
      toast('GitHub sign-in failed: ' + describeError(error), 'bad');
    }
  }

  function describeError(error) {
    if (!error) return 'Unknown error';
    if (error.code === 'expired_token') return 'The code expired. Start again.';
    if (error.code === 'access_denied') return 'Authorisation was cancelled on GitHub.';
    if (error.code === 'device_flow_disabled') return 'Device Flow is not enabled on the OAuth App. Enable it in the app settings.';
    if (error.status === 404) return 'GitHub did not recognise this client ID (404). Check the OAuth App.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(error.message || '')) {
      return 'The browser could not reach github.com. If this persists, use a personal access token instead.';
    }
    return error.message || 'Unknown error';
  }

  async function signInWithToken() {
    var input = $('patInput');
    var remember = $('rememberMe') ? $('rememberMe').checked : false;
    if (!input || !input.value.trim()) { toast('Paste a token first', 'warn'); return; }
    setText('patStatus', 'Checking the token with GitHub…');
    try {
      var session = await A.signInWithToken(input.value, { remember: remember });
      input.value = '';
      toast('Signed in as ' + session.login + ' (' + session.role + ')', 'ok');
      window.location.reload();
    } catch (error) {
      setText('patStatus', describeError(error));
      toast(describeError(error), 'bad');
    }
  }

  async function refresh() {
    try {
      var session = await A.refreshSession();
      if (!session) { toast('Your session had expired – please sign in again.', 'warn'); window.location.reload(); return; }
      render();
      toast('Profile refreshed', 'ok');
    } catch (error) {
      toast(describeError(error), 'bad');
    }
  }

  function saveClientId() {
    var input = $('clientIdInput');
    var value = input ? input.value.trim() : '';
    // Real IDs look like "Iv1.0123456789abcdef" or "Ov23liAbCdEf12345678" – a dot is legitimate.
    if (value && !/^[A-Za-z0-9][A-Za-z0-9._-]{9,}$/.test(value)) {
      toast('That does not look like an OAuth App client ID (e.g. Iv1.0123456789abcdef).', 'bad');
      return;
    }
    A.configure({ clientId: value });
    render();
    toast(value ? 'Client ID saved in this browser' : 'Client ID cleared', value ? 'ok' : 'warn');
  }

  function claimLocal() {
    var result = window.TMSession ? window.TMSession.adoptLocalData() : { ok: false, copied: [] };
    if (result.ok) {
      toast('Copied ' + result.copied.length + ' store(s) into your account', 'ok');
      render();
    } else {
      toast('Nothing to copy – your account already has data or there was none signed out.', 'info');
    }
  }

  /* ------------------------- boot ------------------------- */

  function init() {
    if (!A) {
      var err = $('appError');
      if (err) { err.style.display = 'block'; err.textContent = 'js/github-auth.js did not load.'; }
      return;
    }
    var bind = function (id, event, handler) {
      var el = $(id);
      if (el) el.addEventListener(event, handler);
    };
    bind('deviceFlowCard', 'click', startDevice);
    bind('cancelDevice', 'click', function () { cancelPolling(); setText('deviceStatus', 'Cancelled.'); });
    bind('patSignIn', 'click', signInWithToken);
    bind('refreshProfile', 'click', refresh);
    bind('signOutBtn', 'click', function () {
      if (!window.confirm('Sign out of GitHub on this device? Your local books stay on this browser.')) return;
      A.signOut();
      if (S) S.setNamespace('');
      window.location.reload();
    });
    bind('saveClientId', 'click', saveClientId);
    bind('claimLocal', 'click', claimLocal);
    var pat = $('patInput');
    if (pat) pat.addEventListener('keydown', function (e) { if (e.key === 'Enter') signInWithToken(); });
    render();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.TMAccount = { render: render, startDevice: startDevice, signInWithToken: signInWithToken, describeError: describeError };
})();
