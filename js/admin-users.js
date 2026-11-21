/* ============================================================
   TaxMitra – user administration controller
   Depends on js/cloud.js (TMCloud). Every table is filled from
   the server; when the server is absent or the visitor is not an
   administrator, the page says so plainly.
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

  function alertText(id, message) {
    var el = $(id);
    if (!el) return;
    if (message) { el.textContent = message; el.style.display = ''; }
    else { el.textContent = ''; el.style.display = 'none'; }
  }

  function when(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return new Date(ts).toString(); }
  }

  function bytes(n) {
    var value = Number(n) || 0;
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
    return (value / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function gate(message, kind) {
    var el = $('gateMessage');
    if (!el) return;
    el.className = 'alert ' + (kind || 'info');
    el.innerHTML = message;
    el.hidden = false;
    var body = $('adminBody');
    if (body) body.hidden = true;
  }

  /* ------------------------------------------------------------ render */

  function renderSummary(summary) {
    var set = function (id, text) { var el = $(id); if (el) el.textContent = text; };
    set('kpiAccounts', String(summary.accounts));
    set('kpiVerified', String(summary.verified));
    set('kpiTwoFactor', String(summary.twoFactor));
    set('kpiPasskeys', String(summary.passkeys));
    set('kpiStorage', bytes(summary.bytes));
    set('kpiDocs', summary.documents + ' documents');
    set('kpiRecovery', String(summary.openRecovery));
  }

  function renderRecovery(requests) {
    var body = $('recoveryBody');
    if (!body) return;
    if (!requests.length) {
      body.innerHTML = '<tr><td colspan="5" class="muted-note">No open recovery requests. That is the normal state.</td></tr>';
      return;
    }
    body.innerHTML = requests.map(function (r) {
      var pill = r.status === 'awaiting_admin'
        ? '<span class="pill warn">Awaiting your decision</span>'
        : '<span class="pill no">Email not confirmed yet</span>';
      if (r.expired) pill = '<span class="pill danger">Expired</span>';
      var actions = r.status === 'awaiting_admin' && !r.expired
        ? '<button class="btn-primary-solid" type="button" data-approve="' + esc(r.id) + '">Approve</button>' +
          ' <button class="btn-secondary-solid" type="button" data-deny="' + esc(r.id) + '">Deny</button>'
        : '<span class="muted-note">Waiting for the user</span>';
      return '<tr>' +
        '<td>' + esc(r.email) + '</td>' +
        '<td>' + pill + '</td>' +
        '<td>' + esc(when(r.createdAt)) + '</td>' +
        '<td>' + esc(when(r.expiresAt)) + '</td>' +
        '<td class="row-actions">' + actions + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderUsers(users, meId) {
    var body = $('usersBody');
    if (!body) return;
    if (!users.length) {
      body.innerHTML = '<tr><td colspan="8" class="muted-note">No accounts yet. The first signup creates one.</td></tr>';
      return;
    }
    body.innerHTML = users.map(function (u) {
      var self = u.id === meId;
      var roleCell = self
        ? '<span class="pill ' + (u.role === 'admin' ? 'warn' : 'no') + '">' + esc(u.role) + '</span>'
        : '<select data-role-for="' + esc(u.id) + '" aria-label="Role for ' + esc(u.email) + '">' +
          '<option value="user"' + (u.role === 'user' ? ' selected' : '') + '>user</option>' +
          '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>admin</option>' +
          '</select>';
      return '<tr>' +
        '<td>' + esc(u.email) + (self ? ' <span class="muted-note">(you)</span>' : '') + '</td>' +
        '<td>' + roleCell + '</td>' +
        '<td>' + (u.emailVerified ? '<span class="pill yes">confirmed</span>' : '<span class="pill no">not confirmed</span>') + '</td>' +
        '<td>' + (u.twoFactor ? '<span class="pill yes">on</span>' : '<span class="pill no">off</span>') + '</td>' +
        '<td>' + Number(u.passkeys || 0) + '</td>' +
        '<td>' + Number(u.documents || 0) + ' · ' + bytes(u.bytes) + '</td>' +
        '<td>' + esc(when(u.lastLogin)) + '</td>' +
        '<td class="row-actions">' +
          (u.emailVerified ? '' : '<button class="btn-secondary-solid" type="button" data-verify="' + esc(u.id) + '">Confirm email</button>') +
          (u.twoFactor ? '<button class="btn-secondary-solid" type="button" data-reset2fa="' + esc(u.id) + '">Reset 2FA</button>' : '') +
          (self ? '' : '<button class="btn-secondary-solid" type="button" data-delete="' + esc(u.id) + '" data-email="' + esc(u.email) + '">Delete</button>') +
        '</td>' +
        '</tr>';
    }).join('');
  }

  function renderAudit(events) {
    var body = $('auditBody');
    if (!body) return;
    if (!events || !events.length) {
      body.innerHTML = '<tr><td colspan="3" class="muted-note">No events recorded yet.</td></tr>';
      return;
    }
    body.innerHTML = events.map(function (e) {
      return '<tr><td>' + esc(when(Number(e.at))) + '</td><td><code>' + esc(e.action) + '</code></td><td>' + esc(e.userId || '—') + '</td></tr>';
    }).join('');
  }

  /* ------------------------------------------------------------- load */

  var meId = null;

  function loadAll() {
    return Promise.all([
      C.adminSummary(),
      C.adminUsers(),
      C.adminRecovery(),
      C.adminAudit(100),
    ]).then(function (results) {
      renderSummary(results[0]);
      renderUsers(results[1], meId);
      renderRecovery(results[2]);
      renderAudit(results[3]);
    });
  }

  function fail(err) {
    if (err && err.status === 401) {
      gate('You are not signed in. <a href="cloud.html">Sign in on the Cloud account page</a> with an administrator account.', 'warn');
      return;
    }
    if (err && err.status === 403) {
      gate('This account is not an administrator on this server. Ask the owner to set <code>ADMIN_EMAILS</code> or promote you from an admin account.', 'bad');
      return;
    }
    gate('Could not load the admin data: ' + esc(err && err.message ? err.message : 'unknown error'), 'bad');
  }

  function boot() {
    if (!C) {
      gate('The cloud client (js/cloud.js) did not load, so this console cannot talk to the server.', 'bad');
      return;
    }
    C.probe().then(function (available) {
      if (!available) {
        gate('No TaxMitra server is answering. This console needs the server from <code>server/</code> — the static GitHub Pages build has no accounts to administer.', 'warn');
        return;
      }
      C.restore();
      if (!C.token) {
        gate('You are not signed in. <a href="cloud.html">Sign in on the Cloud account page</a> with an administrator account.', 'warn');
        return;
      }
      C.me().then(function (data) {
        if (!data.user || data.user.role !== 'admin') {
          gate('Signed in as <strong>' + esc(data.user ? data.user.email : 'unknown') + '</strong>, which is not an administrator on this server.', 'bad');
          return;
        }
        meId = data.user.id;
        var body = $('adminBody');
        var gateMessage = $('gateMessage');
        if (body) body.hidden = false;
        if (gateMessage) gateMessage.hidden = true;
        return loadAll().catch(fail);
      }).catch(fail);
    });
  }

  /* ----------------------------------------------------------- actions */

  document.addEventListener('click', function (event) {
    var target = event.target.closest('button');
    if (!target) return;

    if (target.hasAttribute('data-approve')) {
      var id = target.getAttribute('data-approve');
      if (!window.confirm('Approve this recovery? It clears their two-factor, signs out their sessions, and emails them a one-time reset link.')) return;
      target.disabled = true;
      C.adminApproveRecovery(id)
        .then(function (data) {
          alertText('recoveryError', null);
          var message = data.message || 'Approved.';
          if (data.resetLink) message += ' Manual reset link: ' + data.resetLink;
          alertText('recoveryResult', message);
          toast('Recovery approved.', 'ok');
          return loadAll();
        })
        .catch(function (err) { alertText('recoveryError', err.message); target.disabled = false; });
      return;
    }

    if (target.hasAttribute('data-deny')) {
      var denyId = target.getAttribute('data-deny');
      var note = window.prompt('Reason for denying (kept in the audit note):', 'Could not verify identity');
      if (note === null) return;
      target.disabled = true;
      C.adminDenyRecovery(denyId, note)
        .then(function () {
          alertText('recoveryError', null);
          alertText('recoveryResult', 'Request denied. The account keeps two-factor on.');
          toast('Recovery denied.', 'info');
          return loadAll();
        })
        .catch(function (err) { alertText('recoveryError', err.message); target.disabled = false; });
      return;
    }

    if (target.hasAttribute('data-verify')) {
      var userId = target.getAttribute('data-verify');
      target.disabled = true;
      C.adminVerifyEmail(userId)
        .then(function () {
          alertText('usersError', null);
          alertText('usersResult', 'Email marked confirmed. The account owner was not notified.');
          return loadAll();
        })
        .catch(function (err) { alertText('usersError', err.message); target.disabled = false; });
      return;
    }

    if (target.hasAttribute('data-reset2fa')) {
      var resetId = target.getAttribute('data-reset2fa');
      if (!window.confirm('Clear two-factor for this account? Every session of that user will be signed out.')) return;
      target.disabled = true;
      C.adminReset2fa(resetId)
        .then(function (data) {
          alertText('usersError', null);
          alertText('usersResult', data.message || 'Two-factor cleared.');
          toast('Two-factor cleared.', 'ok');
          return loadAll();
        })
        .catch(function (err) { alertText('usersError', err.message); target.disabled = false; });
      return;
    }

    if (target.hasAttribute('data-delete')) {
      var deleteId = target.getAttribute('data-delete');
      var email = target.getAttribute('data-email');
      if (!window.confirm('Delete ' + email + ' and every document in that account? This cannot be undone.')) return;
      target.disabled = true;
      C.adminDeleteUser(deleteId)
        .then(function () {
          alertText('usersError', null);
          alertText('usersResult', 'Account deleted.');
          toast('Account deleted.', 'info');
          return loadAll();
        })
        .catch(function (err) { alertText('usersError', err.message); target.disabled = false; });
    }
  });

  document.addEventListener('change', function (event) {
    var select = event.target.closest('select[data-role-for]');
    if (!select) return;
    var targetId = select.getAttribute('data-role-for');
    var role = select.value;
    select.disabled = true;
    C.adminSetRole(targetId, role)
      .then(function () {
        alertText('usersError', null);
        alertText('usersResult', 'Role updated to ' + role + '.');
        toast('Role updated.', 'ok');
        return loadAll();
      })
      .catch(function (err) {
        alertText('usersError', err.message);
        select.disabled = false;
      });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
