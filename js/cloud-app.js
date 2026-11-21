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
        C.login(($('loginEmail') || {}).value, ($('loginPassword') || {}).value)
          .then(function (user) {
            loginForm.reset();
            toast('Signed in as ' + user.email, 'ok');
            C.startAuto(30000);
            renderAll();
            return C.syncNow().then(function (result) { renderResult(result); renderCloudUsage(); })
              .catch(handleSyncError);
          })
          .catch(function (err) { alertText('loginError', err.message || 'Could not sign in.'); })
          .then(function () { if (btn) btn.disabled = false; });
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
    if (!C || !C.user) {
      var summary = $('cloudSummary');
      if (summary) summary.textContent = 'Sign in to see the cloud copy.';
    }
    renderAi();
    renderGovt();
    if (C && C.user) renderCloudUsage();
  }

  function boot() {
    renderServer();
    wire();
    if (!C) return;
    C.boot();
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
