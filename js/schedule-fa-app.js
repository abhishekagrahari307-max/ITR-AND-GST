/* ===================================================
   TaxMitra – Schedule FA page controller
   Depends on: js/schedule-fa.js, js/itr-schema.js, js/tm-store.js, js/session-boot.js

   Entries start empty. Everything on the page comes from what the
   taxpayer typed, converted with the rate they entered.
   =================================================== */
(function () {
  'use strict';

  var F = window.TMScheduleFA;
  var S = window.TMStore;
  var STORE_KEY = 'tm-schedule-fa';
  var entries = [];

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function inr(amount) {
    var value = Number(amount) || 0;
    try {
      return '₹' + value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) {
      return '₹' + value.toFixed(2);
    }
  }

  function toast(message, kind) {
    var host = $('toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      host.style.cssText = 'position:fixed;right:1rem;bottom:1rem;z-index:999;display:flex;flex-direction:column;gap:.5rem';
      document.body.appendChild(host);
    }
    var el = document.createElement('div');
    el.textContent = message;
    el.style.cssText = 'background:#111827;color:#fff;padding:.65rem 1rem;border-radius:8px;font-size:.82rem;max-width:340px;box-shadow:0 8px 24px rgba(0,0,0,.25);border-left:3px solid ' +
      (kind === 'bad' ? '#ef4444' : kind === 'warn' ? '#f59e0b' : '#10b981');
    host.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }

  function msg(text, kind) {
    var el = $('addMsg');
    if (!el) return;
    el.className = 'alert ' + (kind || 'info');
    el.textContent = text;
  }

  /* ------------------------- form ------------------------- */

  function fillOptions() {
    var typeSelect = $('faType');
    if (typeSelect) {
      typeSelect.innerHTML = Object.keys(F.TYPES).map(function (key) {
        return '<option value="' + key + '">' + esc(F.TYPES[key].label) + '</option>';
      }).join('');
    }
    var currencySelect = $('faCurrency');
    if (currencySelect) {
      currencySelect.innerHTML = F.CURRENCIES.map(function (code) {
        return '<option value="' + code + '">' + code + '</option>';
      }).join('');
    }
  }

  function readForm() {
    return F.normalise({
      type: $('faType').value,
      country: $('faCountry').value,
      countryCode: $('faCountryCode').value,
      entity: $('faEntity').value,
      accountNumber: $('faAccount').value,
      currency: $('faCurrency').value,
      rate: $('faRate').value,
      acquired: $('faAcquired').value,
      initialForeign: $('faInitial').value,
      peakForeign: $('faPeak').value,
      closingForeign: $('faClosing').value,
      notes: $('faNotes').value,
      incomeIncluded: $('faIncomeIncluded').checked
    });
  }

  function resetForm() {
    ['faCountry', 'faCountryCode', 'faEntity', 'faAccount', 'faRate', 'faAcquired',
      'faInitial', 'faPeak', 'faClosing', 'faNotes'].forEach(function (id) { $(id).value = ''; });
    $('faIncomeIncluded').checked = false;
    $('faCurrency').value = 'USD';
    $('faType').value = 'bank';
  }

  /* ------------------------- add / remove ------------------------- */

  function addEntry() {
    var row = readForm();
    if (!row.country) { msg('Country is required — Schedule FA is a country-wise disclosure.', 'bad'); return; }
    if (!row.entity) { msg('Name the bank, broker or entity holding the asset.', 'bad'); return; }
    // A foreign amount without the rule 115 rate cannot be converted — say so
    // instead of silently treating it as zero rupees.
    if (!(row.rate > 0) && (row.initialForeign > 0 || row.peakForeign > 0 || row.closingForeign > 0)) {
      msg('Foreign-currency amounts need a rule 115 rate before they can be converted to rupees.', 'bad');
      return;
    }
    var hasValue = row.initialValue > 0 || row.peakValue > 0 || row.closingValue > 0;
    if (!hasValue) {
      msg('Enter at least one value (initial, peak or closing) — in the foreign currency with a rate, or directly in rupees.', 'bad');
      return;
    }
    row.id = 'fa-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    entries.push(row);
    renderAll();
    resetForm();
    msg('Added ' + (F.TYPES[row.type] || F.TYPES.other).label + ' in ' + row.country + ' (' + inr(row.closingValue) + ' closing).', 'ok');
  }

  function removeEntry(id) {
    if (!window.confirm('Remove this Schedule FA entry?')) return;
    entries = entries.filter(function (row) { return row.id !== id; });
    renderAll();
    toast('Entry removed.', 'ok');
  }

  /* ------------------------- rendering ------------------------- */

  function renderTotals(totals) {
    var host = $('totalsGrid');
    if (!host) return;
    if (!totals.count) {
      host.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span class="big">🌍</span><p>No foreign assets added yet. ' +
        'If you held none during the year, Schedule FA is not applicable.</p></div>';
      return;
    }
    host.innerHTML =
      '<div class="kpi"><div class="kpi-label">Entries</div><div class="kpi-value">' + totals.count + '</div>' +
      '<div class="kpi-sub">' + totals.byCountry.length + ' country(ies)</div></div>' +
      '<div class="kpi"><div class="kpi-label">Total peak value</div><div class="kpi-value">' + inr(totals.peak) + '</div>' +
      '<div class="kpi-sub">highest balance in the year</div></div>' +
      '<div class="kpi"><div class="kpi-label">Total closing value</div><div class="kpi-value">' + inr(totals.closing) + '</div>' +
      '<div class="kpi-sub">as on 31 March</div></div>' +
      '<div class="kpi"><div class="kpi-label">Initial value</div><div class="kpi-value">' + inr(totals.initial) + '</div>' +
      '<div class="kpi-sub">when acquired</div></div>';
  }

  function renderEntries(totals) {
    var host = $('entriesHost');
    if (!host) return;
    if (!totals.count) {
      host.innerHTML = '';
      return;
    }
    var rows = totals.rows.map(function (row) {
      var type = F.TYPES[row.type] || F.TYPES.other;
      return '<tr>' +
        '<td>' + esc(row.schedule) + '</td>' +
        '<td>' + esc(type.label) + '</td>' +
        '<td>' + esc(row.country) + (row.countryCode ? ' <span class="muted-note">(' + esc(row.countryCode) + ')</span>' : '') + '</td>' +
        '<td>' + esc(row.entity) + (row.accountNumber ? '<br><span class="muted-note">' + esc(row.accountNumber) + '</span>' : '') + '</td>' +
        '<td class="num">' + (row.rate > 0 ? esc(row.currency) + ' @ ' + row.rate : '—') + '</td>' +
        '<td class="num">' + inr(row.initialValue) + '</td>' +
        '<td class="num">' + inr(row.peakValue) + '</td>' +
        '<td class="num">' + inr(row.closingValue) + '</td>' +
        '<td>' + (row.incomeIncluded ? '✅' : (row.notes ? '📝' : '⚠️')) + '</td>' +
        '<td><button class="btn-secondary-solid" style="padding:0.25rem 0.55rem;font-size:0.72rem" data-remove="' + esc(row.id) + '" type="button">Remove</button></td>' +
        '</tr>';
    }).join('');
    host.innerHTML = '<div class="table-wrap"><table class="tm-table"><thead><tr>' +
      '<th>Sch.</th><th>Type</th><th>Country</th><th>Entity</th><th class="num">Rate</th>' +
      '<th class="num">Initial ₹</th><th class="num">Peak ₹</th><th class="num">Closing ₹</th><th>Income</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="muted-note" style="margin-top:0.5rem">Rate column shows the rule 115 rate you entered. ' +
      'Rupee values are the foreign amount × that rate.</p>';
  }

  function renderChecklist() {
    var host = $('checklistHost');
    if (!host) return;
    var result = F.checklist(entries);
    host.innerHTML = result.items.map(function (item) {
      return '<li><span class="mark ' + (item.done ? 'done' : 'todo') + '">' + (item.done ? '✅' : '⚠️') + '</span>' +
        '<span>' + esc(item.text) + '</span></li>';
    }).join('') +
      '<li style="border-bottom:none;font-weight:700"><span class="mark">' +
      (result.complete ? '🎉' : '📋') + '</span><span>' + result.doneCount + ' of ' + result.total + ' checks complete</span></li>';
  }

  function renderValidation() {
    var host = $('validationHost');
    if (!host) return;
    if (!entries.length) { host.innerHTML = ''; return; }
    var result = F.validate(entries, { fy: $('faFy') ? $('faFy').value : undefined });
    var items = result.errors.concat(result.warnings);
    if (!items.length) {
      host.innerHTML = '<div class="alert ok">✅ No Schedule FA issues found in these entries.</div>';
      return;
    }
    host.innerHTML = '<div class="alert ' + (result.errors.length ? 'bad' : 'warn') + '">' +
      '<strong>' + (result.errors.length ? result.errors.length + ' issue(s) to fix' : 'Advisory notes') + '</strong>' +
      '<ul>' + items.map(function (item) { return '<li>' + esc(item.message) + '</li>'; }).join('') + '</ul></div>';
  }

  function renderAll() {
    var totals = F.totals(entries);
    renderTotals(totals);
    renderEntries(totals);
    renderChecklist();
    renderValidation();
    var has = entries.length > 0;
    ['exportCsvBtn', 'saveBtn', 'sendToWizardBtn'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = !has;
    });
  }

  /* ------------------------- persistence / export ------------------------- */

  function save() {
    if (!S) { toast('Storage is unavailable in this browser.', 'bad'); return; }
    if (!entries.length) { toast('Nothing to save yet.', 'warn'); return; }
    if (S.write(STORE_KEY, F.toStore(entries))) {
      toast('Schedule FA saved on this browser' + (S.getNamespace() ? ' (account profile)' : '') + '.', 'ok');
    } else {
      toast('Could not save — browser storage may be full.', 'bad');
    }
  }

  function restore() {
    if (!S) return;
    var saved = S.read(STORE_KEY, null);
    if (!saved || !Array.isArray(saved.entries) || !saved.entries.length) return;
    entries = saved.entries.map(F.normalise);
    renderAll();
    msg('Restored ' + entries.length + ' entr(ies) saved on this browser.', 'info');
  }

  function exportCsv() {
    if (!entries.length) return;
    var csv = F.toCsv(entries);
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'schedule-fa-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('CSV exported.', 'ok');
  }

  function sendToWizard() {
    if (!entries.length) { toast('Add at least one entry first.', 'warn'); return; }
    if (!S) { toast('Storage is unavailable in this browser.', 'bad'); return; }
    var draft = S.read(S.KEYS.itrDraft, null) || { state: {} };
    var state = draft.state || {};
    var profile = Object.assign({
      fy: '2025-26', entityType: 'individual', name: '', pan: '', age: 30,
      residentialStatus: 'resident', houseProperties: 1
    }, state.profile || {});
    // Guard the wizard's other fields: only flip the flag the taxpayer asked for.
    profile.foreignAssets = true;
    state.profile = profile;
    state.fa = F.toStore(entries);
    S.write(S.KEYS.itrDraft, { savedAt: new Date().toISOString(), state: state });
    toast('Sent ' + entries.length + ' entr(ies) to the ITR wizard. Schedule FA will be exported with the return.', 'ok');
  }

  /* ------------------------- boot ------------------------- */

  function init() {
    if (!F) {
      var err = $('appError');
      if (err) { err.style.display = 'block'; err.textContent = 'js/schedule-fa.js did not load, so Schedule FA is unavailable.'; }
      return;
    }
    fillOptions();
    var bind = function (id, event, handler) {
      var el = $(id);
      if (el) el.addEventListener(event, handler);
    };
    bind('addEntryBtn', 'click', addEntry);
    bind('resetFormBtn', 'click', resetForm);
    bind('saveBtn', 'click', save);
    bind('exportCsvBtn', 'click', exportCsv);
    bind('sendToWizardBtn', 'click', sendToWizard);
    var host = $('entriesHost');
    if (host) {
      host.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-remove]');
        if (!btn) return;
        removeEntry(btn.getAttribute('data-remove'));
      });
    }
    restore();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.TMScheduleFAApp = {
    addEntry: addEntry,
    removeEntry: removeEntry,
    save: save,
    exportCsv: exportCsv,
    sendToWizard: sendToWizard,
    entries: function () { return entries; },
    render: renderAll
  };
})();
