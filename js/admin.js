/* ===================================================
   TaxMitra – Admin / Storage console
   Everything here works on this browser's localStorage only.
   No server, no account, no telemetry.
   Depends on: js/tm-store.js, js/gst-billing.js, js/income-tax.js
   =================================================== */
(function () {
  'use strict';

  var S = window.TMStore;
  var G = window.TMGST;
  var T = window.TMIT;

  if (!S) {
    document.addEventListener('DOMContentLoaded', function () {
      var el = document.getElementById('appError');
      if (el) { el.style.display = 'block'; el.textContent = 'Could not load the storage layer (js/tm-store.js missing).'; }
    });
    return;
  }

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function bytes(n) {
    var v = Number(n) || 0;
    if (v < 1024) return v + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
    return (v / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function money(n) { return G ? G.formatINR(n) : '₹' + (Number(n) || 0).toFixed(2); }

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
    }, 3400);
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ------------------------- overview ------------------------- */
  function renderOverview() {
    var sizes = S.sizeBreakdown();
    var total = S.totalSize();
    var invoices = S.list('invoices');
    var customers = S.list('customers');
    var items = S.list('items');
    var draft = S.read(S.KEYS.itrDraft, null);
    var settings = S.getSettings();

    setText('storageTotal', bytes(total));
    setText('storagePersistent', S.isPersistent() ? 'Available' : 'Unavailable – changes will be lost on refresh');
    setText('invoiceCount', String(invoices.length));
    setText('customerCount', String(customers.length));
    setText('itemCount', String(items.length));
    setText('draftState', draft ? 'Saved ' + String(draft.savedAt || '').slice(0, 16).replace('T', ' ') : 'No draft');
    setText('settingsState', settings.businessName ? settings.businessName : 'Not configured');

    var body = $('sizeBody');
    if (body) {
      var labels = {
        settings: 'Billing settings',
        customers: 'Customers',
        items: 'Saved items',
        invoices: 'Invoices',
        counter: 'Invoice counter',
        itrDraft: 'ITR wizard draft'
      };
      body.innerHTML = Object.keys(sizes).map(function (key) {
        return '<tr><td>' + esc(labels[key] || key) + '</td><td class="num">' + bytes(sizes[key]) + '</td></tr>';
      }).join('') +
        '<tr class="strong-row"><td>Total</td><td class="num">' + bytes(total) + '</td></tr>';
    }

    var gst = G ? G.calcInvoice : null;
    var invoiced = 0;
    var tax = 0;
    if (gst) {
      invoices.filter(function (i) { return i.status !== 'cancelled'; }).forEach(function (inv) {
        var calc = G.calcInvoice(inv);
        invoiced += calc.grandTotal;
        tax += calc.totalTax;
      });
    }
    setText('invoicedTotal', money(invoiced));
    setText('gstTotal', money(tax));

    if (!S.isPersistent()) {
      var warn = $('persistenceWarning');
      if (warn) warn.hidden = false;
    }
  }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = value;
  }

  /* ------------------------- integrity check ------------------------- */
  function runIntegrityCheck() {
    var issues = [];
    var invoices = S.list('invoices');
    var customers = S.list('customers');
    var settings = S.getSettings();

    if (!settings.businessName) issues.push({ level: 'info', message: 'Business name is not set – invoices will print a placeholder.' });
    if (!settings.gstin) {
      issues.push({ level: 'warn', message: 'Seller GSTIN is not set.' });
    } else if (G) {
      var v = G.validateGSTIN(settings.gstin);
      if (!v.valid) issues.push({ level: 'error', message: 'Seller GSTIN is invalid: ' + v.reasons.join('; ') });
    }

    if (G) {
      var seen = {};
      invoices.forEach(function (inv) {
        var label = inv.invoiceNumber || '(no number)';
        if (seen[label]) issues.push({ level: 'error', message: 'Duplicate invoice number: ' + label });
        seen[label] = true;

        if (!G.isValidDate(inv.invoiceDate)) issues.push({ level: 'error', message: label + ': invoice date "' + inv.invoiceDate + '" is not a valid date' });
        if (inv.buyerGstin && !G.isValidGSTIN(inv.buyerGstin)) {
          issues.push({ level: 'error', message: label + ': buyer GSTIN is invalid (' + inv.buyerGstin + ')' });
        }
        var calc = G.calcInvoice(inv);
        if (inv.computed && Math.abs((inv.computed.grandTotal || 0) - calc.grandTotal) > 0.01) {
          issues.push({
            level: 'warn',
            message: label + ': stored total ' + money(inv.computed.grandTotal) + ' differs from recomputed ' + money(calc.grandTotal) +
              ' (line items changed after saving?)'
          });
        }
        if (!inv.lines || !inv.lines.length) issues.push({ level: 'error', message: label + ': has no line items' });
        if (!inv.buyerName) issues.push({ level: 'warn', message: label + ': buyer name is empty' });
      });
    }

    customers.forEach(function (c) {
      if (c.gstin && G && !G.isValidGSTIN(c.gstin)) {
        issues.push({ level: 'warn', message: 'Customer "' + c.name + '" has an invalid GSTIN (' + c.gstin + ')' });
      }
    });

    var draft = S.read(S.KEYS.itrDraft, null);
    if (draft && draft.state && draft.state.profile) {
      var pan = String(draft.state.profile.pan || '');
      if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
        issues.push({ level: 'warn', message: 'ITR draft PAN "' + pan + '" is not in the ABCDE1234F format' });
      }
    }
    if (T) {
      var fy = T.currentFinancialYear();
      if (!T.FINANCIAL_YEARS[fy]) issues.push({ level: 'info', message: 'The tax engine has no slab table for ' + fy + ' – update js/income-tax.js.' });
    }

    var host = $('integrityBody');
    if (host) {
      host.innerHTML = issues.length
        ? issues.map(function (i) {
          return '<tr><td><span class="pill ' + (i.level === 'error' ? 'bad' : i.level === 'warn' ? 'warn' : 'muted') + '">' + esc(i.level) + '</span></td><td>' + esc(i.message) + '</td></tr>';
        }).join('')
        : '<tr><td><span class="pill ok">ok</span></td><td>No issues found in the stored data.</td></tr>';
    }
    var summary = $('integritySummary');
    if (summary) {
      var errors = issues.filter(function (i) { return i.level === 'error'; }).length;
      var warns = issues.filter(function (i) { return i.level === 'warn'; }).length;
      summary.textContent = issues.length
        ? errors + ' error(s), ' + warns + ' warning(s), ' + (issues.length - errors - warns) + ' note(s)'
        : 'All checks passed';
      summary.className = 'alert ' + (errors ? 'bad' : warns ? 'warn' : 'info');
      summary.hidden = false;
    }
    toast('Integrity check finished', 'ok');
  }

  /* ------------------------- backup / restore ------------------------- */
  function exportBackup() {
    var payload = S.exportAll();
    var stamp = new Date().toISOString().slice(0, 10);
    download('taxmitra-backup-' + stamp + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('Backup downloaded', 'ok');
  }

  function importBackup(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('That file is larger than 5 MB – refusing to import', 'bad'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var payload;
      try {
        payload = JSON.parse(String(reader.result));
      } catch (e) {
        toast('That file is not valid JSON', 'bad');
        return;
      }
      if (!window.confirm('Importing replaces ALL current billing data in this browser. Continue?')) return;
      var result = S.importAll(payload);
      if (!result.ok) {
        toast(result.error || 'Import failed', 'bad');
        return;
      }
      toast('Imported: ' + result.imported.length + ' store(s)' + (result.skipped.length ? ', skipped ' + result.skipped.length : ''), 'ok');
      renderOverview();
      runIntegrityCheck();
    };
    reader.onerror = function () { toast('Could not read that file', 'bad'); };
    reader.readAsText(file);
  }

  function clearAll() {
    var typed = window.prompt('This deletes every invoice, customer, item and draft in this browser.\nType DELETE to confirm:');
    if (typed !== 'DELETE') { toast('Nothing was deleted', 'info'); return; }
    S.clearAll();
    renderOverview();
    setText('integritySummary', '');
    var host = $('integrityBody');
    if (host) host.innerHTML = '<tr><td colspan="2" class="empty">Run a check to inspect the (now empty) store.</td></tr>';
    toast('All TaxMitra data cleared', 'warn');
  }

  /* ------------------------- role gating ------------------------- */
  function roleState() {
    // Read the live session so a sign-in/out in another tab (or a re-render
    // after sign-in) is reflected without a page reload.
    var auth = window.TMGitHubAuth;
    if (auth) {
      var session = null;
      try { session = auth.getSession(); } catch (e) { session = null; }
      if (session) return { signedIn: true, admin: session.role === 'admin', login: session.login, role: session.role };
      return { signedIn: false, admin: false, login: null, role: 'guest' };
    }
    var s = window.TMSession;
    if (!s) return { signedIn: false, admin: false, login: null, role: 'guest' };
    return { signedIn: s.isSignedIn, admin: s.isAdmin, login: s.login, role: s.role };
  }

  function applyRole() {
    var role = roleState();
    var banner = $('roleBanner');
    if (banner) {
      if (!role.signedIn) {
        banner.className = 'alert info';
        banner.innerHTML = '<strong>Working as a guest.</strong> Everything here reads and backs up this browser’s local books. ' +
          'Restoring a backup over everything and wiping data need an administrator — <a href="account.html">sign in with GitHub</a>.';
      } else if (role.admin) {
        banner.className = 'alert warn';
        banner.innerHTML = '<strong>Administrator: ' + esc(role.login) + '.</strong> Destructive actions are unlocked for this session. ' +
          'Data is still only ever stored on this browser.';
      } else {
        banner.className = 'alert info';
        banner.innerHTML = '<strong>Signed in as ' + esc(role.login) + ' (user).</strong> Backup and inspection are available; ' +
          'restore and wipe need an administrator.';
      }
    }
    ['importBackupBtn', 'clearBtn'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.disabled = !role.admin;
      el.title = role.admin ? '' : 'Administrator sign-in required';
      el.style.opacity = role.admin ? '1' : '0.5';
      el.style.cursor = role.admin ? 'pointer' : 'not-allowed';
    });
    var note = $('adminOnlyNote');
    if (note) note.hidden = role.admin;
  }

  function requireAdmin(action) {
    var role = roleState();
    if (role.admin) return true;
    toast('“' + action + '” needs an administrator. Sign in with GitHub on the Account page.', 'warn');
    return false;
  }

  function init() {
    var bind = function (id, handler) {
      var el = $(id);
      if (el) el.addEventListener('click', handler);
    };
    bind('exportBackupBtn', exportBackup);
    bind('importBackupBtn', function () {
      if (!requireAdmin('Restore from backup')) return;
      var input = $('importFile');
      if (input) input.click();
    });
    var input = $('importFile');
    if (input) input.addEventListener('change', function () {
      importBackup(input.files && input.files[0]);
      input.value = '';
    });
    bind('checkBtn', runIntegrityCheck);
    bind('clearBtn', function () {
      if (!requireAdmin('Delete all data')) return;
      clearAll();
    });

    applyRole();
    renderOverview();
    runIntegrityCheck();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.TMAdmin = { renderOverview: renderOverview, runIntegrityCheck: runIntegrityCheck, exportBackup: exportBackup, applyRole: applyRole };
})();
