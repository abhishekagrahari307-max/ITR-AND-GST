/* ===================================================
   TaxMitra – Billing Application (local-first)
   Invoices, customers, items and GSTR-1 working papers
   stored entirely in the browser via TMStore.
   Depends on: js/gst-billing.js (TMGST), js/tm-store.js (TMStore)
   =================================================== */
(function () {
  'use strict';

  var G = window.TMGST;
  var S = window.TMStore;
  if (!G || !S) {
    document.addEventListener('DOMContentLoaded', function () {
      var el = document.getElementById('appError');
      if (el) { el.style.display = 'block'; el.textContent = 'Could not load the GST engine (js/gst-billing.js or js/tm-store.js missing).'; }
    });
    return;
  }

  var state = {
    settings: S.getSettings(),
    customers: S.list('customers'),
    items: S.list('items'),
    invoices: S.list('invoices'),
    editor: null,      // invoice being edited
    activeTab: 'dashboard',
    filters: { search: '', status: 'all', month: 'all' }
  };

  /* ------------------------- utilities ------------------------- */
  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(n) { return G.formatINR(n); }

  function today() { return new Date().toISOString().slice(0, 10); }

  function addDays(iso, days) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + Number(days || 0));
    return d.toISOString().slice(0, 10);
  }

  function toast(message, type) {
    var host = $('toastHost');
    if (!host) { return; }
    var el = document.createElement('div');
    el.className = 'tm-toast ' + (type || 'info');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 300);
    }, 3200);
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function persist() {
    S.saveList('customers', state.customers);
    S.saveList('items', state.items);
    S.saveList('invoices', state.invoices);
    S.saveSettings(state.settings);
  }

  function blankInvoice() {
    var settings = state.settings;
    var prefix = settings.invoicePrefix || 'INV/';
    var fy = G.financialYear(today());
    var number = G.nextInvoiceNumber(prefix + (fy ? fy + '/' : ''), S.peekInvoiceCounter(), 4);
    return {
      id: null,
      invoiceNumber: number,
      invoiceDate: today(),
      dueDate: addDays(today(), 15),
      buyerId: '',
      buyerName: '',
      buyerGstin: '',
      buyerState: settings.state || '27',
      buyerAddress: '',
      buyerEmail: '',
      supplyType: 'intra',
      reverseCharge: false,
      notes: '',
      status: 'unpaid',
      lines: [emptyLine()],
      payments: []
    };
  }

  function emptyLine() {
    return { description: '', hsn: '', quantity: 1, rate: 0, gstRate: 18, discount: 0, discountType: 'amount', cessRate: 0 };
  }

  /* ------------------------- shell / tabs ------------------------- */
  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('[data-tab-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-tab-panel') !== tab;
    });
    document.querySelectorAll('[data-tab-btn]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab-btn') === tab);
      btn.setAttribute('aria-selected', btn.getAttribute('data-tab-btn') === tab ? 'true' : 'false');
    });
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'invoices') renderInvoiceTable();
    if (tab === 'customers') renderCustomers();
    if (tab === 'items') renderItems();
    if (tab === 'settings') fillSettingsForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ------------------------- dashboard ------------------------- */
  function invoicedTotal(invoices) {
    return G.round2(invoices.reduce(function (sum, inv) { return sum + G.calcInvoice(inv).grandTotal; }, 0));
  }

  function renderDashboard() {
    var live = state.invoices.filter(function (i) { return i.status !== 'cancelled'; });
    var fy = G.financialYear(today());
    var thisFy = live.filter(function (i) { return G.financialYear(i.invoiceDate) === fy; });
    var paid = thisFy.filter(function (i) { return i.status === 'paid'; });
    var unpaid = thisFy.filter(function (i) { return i.status !== 'paid'; });

    var taxTotal = 0;
    thisFy.forEach(function (inv) { taxTotal += G.calcInvoice(inv).totalTax; });

    setText('statInvoiced', money(invoicedTotal(thisFy)));
    setText('statCollected', money(invoicedTotal(paid)));
    setText('statOutstanding', money(invoicedTotal(unpaid)));
    setText('statTax', money(taxTotal));
    setText('statCount', String(thisFy.length));
    setText('statFy', fy || '—');

    var ageing = G.ageingReport(thisFy, today());
    var ageingBody = $('ageingBody');
    if (ageingBody) {
      var rows = [
        ['Not yet due', ageing.current],
        ['1 – 30 days', ageing.days30],
        ['31 – 60 days', ageing.days60],
        ['61 – 90 days', ageing.days90],
        ['Over 90 days', ageing.over90]
      ];
      ageingBody.innerHTML = rows.map(function (r) {
        return '<tr><td>' + esc(r[0]) + '</td><td class="num">' + money(r[1]) + '</td></tr>';
      }).join('');
    }

    var recent = state.invoices.slice().sort(function (a, b) {
      return String(b.invoiceDate).localeCompare(String(a.invoiceDate));
    }).slice(0, 6);
    var recentBody = $('recentBody');
    if (recentBody) {
      recentBody.innerHTML = recent.length
        ? recent.map(function (inv) {
          return '<tr><td><a href="#" data-open="' + esc(inv.id) + '">' + esc(inv.invoiceNumber) + '</a></td>' +
            '<td>' + esc(inv.buyerName) + '</td><td>' + esc(inv.invoiceDate) + '</td>' +
            '<td class="num">' + money(G.calcInvoice(inv).grandTotal) + '</td>' +
            '<td><span class="pill ' + statusClass(inv.status) + '">' + esc(inv.status) + '</span></td></tr>';
        }).join('')
        : '<tr><td colspan="5" class="empty">No invoices yet. Create your first invoice.</td></tr>';
    }

    var warn = $('gstinWarning');
    if (warn) {
      var v = state.settings.gstin ? G.validateGSTIN(state.settings.gstin) : null;
      if (!state.settings.gstin) {
        warn.innerHTML = '<strong>No seller GSTIN set.</strong> Invoices are still usable, but GSTR-1 working papers need it. Add it in Settings.';
        warn.hidden = false;
      } else if (v && !v.valid) {
        warn.innerHTML = '<strong>Seller GSTIN looks invalid:</strong> ' + esc(v.reasons.join('; ')) + ' Fix it in Settings.';
        warn.hidden = false;
      } else {
        warn.hidden = true;
      }
    }
  }

  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  function statusClass(status) {
    return status === 'paid' ? 'ok' : status === 'cancelled' ? 'muted' : status === 'partial' ? 'warn' : 'bad';
  }

  /* ------------------------- invoice editor ------------------------- */
  function openEditor(invoiceId) {
    if (invoiceId) {
      var existing = state.invoices.filter(function (i) { return i.id === invoiceId; })[0];
      state.editor = existing ? JSON.parse(JSON.stringify(existing)) : blankInvoice();
    } else {
      state.editor = blankInvoice();
    }
    switchTab('new');
    renderEditor();
    var heading = $('editorTitle');
    if (heading) heading.textContent = state.editor.id ? 'Edit invoice ' + state.editor.invoiceNumber : 'New invoice';
  }

  function renderEditor() {
    var inv = state.editor;
    if (!inv) return;
    setValue('invoiceNumber', inv.invoiceNumber);
    setValue('invoiceDate', inv.invoiceDate);
    setValue('dueDate', inv.dueDate);
    setValue('buyerName', inv.buyerName);
    setValue('buyerGstin', inv.buyerGstin);
    setValue('buyerAddress', inv.buyerAddress);
    setValue('buyerEmail', inv.buyerEmail);
    setValue('buyerState', inv.buyerState);
    setValue('invoiceNotes', inv.notes);
    setValue('invoiceStatus', inv.status);
    var rc = $('reverseCharge');
    if (rc) rc.checked = !!inv.reverseCharge;

    var custSelect = $('buyerSelect');
    if (custSelect) {
      custSelect.innerHTML = '<option value="">— new / ad-hoc buyer —</option>' +
        state.customers.map(function (c) {
          return '<option value="' + esc(c.id) + '">' + esc(c.name) + (c.gstin ? ' (' + esc(c.gstin) + ')' : '') + '</option>';
        }).join('');
      custSelect.value = inv.buyerId || '';
    }
    renderLines();
    renderTotals();
  }

  function setValue(id, value) {
    var el = $(id);
    if (el) el.value = value === undefined || value === null ? '' : value;
  }

  function renderLines() {
    var body = $('lineRows');
    if (!body) return;
    var supplyType = currentSupplyType();
    body.innerHTML = state.editor.lines.map(function (line, index) {
      var calc = G.calcLine(line, { supplyType: supplyType, priceIncludesTax: state.settings.priceIncludesTax });
      return '<tr data-line="' + index + '">' +
        '<td><input type="text" data-field="description" value="' + esc(line.description) + '" placeholder="Item / service description" aria-label="Description line ' + (index + 1) + '"></td>' +
        '<td><input type="text" data-field="hsn" value="' + esc(line.hsn) + '" placeholder="HSN/SAC" aria-label="HSN line ' + (index + 1) + '"></td>' +
        '<td class="w-qty"><input type="number" min="0" step="0.01" data-field="quantity" value="' + esc(line.quantity) + '" aria-label="Quantity line ' + (index + 1) + '"></td>' +
        '<td class="w-rate"><input type="number" min="0" step="0.01" data-field="rate" value="' + esc(line.rate) + '" aria-label="Rate line ' + (index + 1) + '"></td>' +
        '<td class="w-rate"><input type="number" min="0" step="0.01" data-field="discount" value="' + esc(line.discount) + '" aria-label="Discount line ' + (index + 1) + '"></td>' +
        '<td class="w-gst"><select data-field="gstRate" aria-label="GST rate line ' + (index + 1) + '">' +
        G.GST_SLABS.map(function (slab) {
          return '<option value="' + slab.rate + '"' + (Number(line.gstRate) === slab.rate ? ' selected' : '') + '>' + slab.rate + '%</option>';
        }).join('') + '</select></td>' +
        '<td class="num">' + money(calc.taxableValue) + '</td>' +
        '<td class="num">' + money(calc.lineTotal) + '</td>' +
        '<td><button type="button" class="btn-icon danger" data-remove-line="' + index + '" title="Remove line">✕</button></td>' +
        '</tr>';
    }).join('');
  }

  function currentSupplyType() {
    var inv = state.editor || {};
    var sellerState = state.settings.state;
    var buyerState = inv.buyerState;
    if (sellerState && buyerState && sellerState !== buyerState) return 'inter';
    return 'intra';
  }

  function renderTotals() {
    var inv = state.editor;
    if (!inv) return;
    var calc = G.calcInvoice({
      lines: inv.lines,
      sellerState: state.settings.state,
      buyerState: inv.buyerState,
      priceIncludesTax: state.settings.priceIncludesTax
    });
    setText('totTaxable', money(calc.totals.taxableValue));
    setText('totCgst', money(calc.totals.cgst));
    setText('totSgst', money(calc.totals.sgst));
    setText('totIgst', money(calc.totals.igst));
    setText('totRound', money(calc.roundOff));
    setText('totGrand', money(calc.grandTotal));
    setText('totWords', calc.amountInWords);
    setText('totSupply', calc.supplyType === 'inter' ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)');
    var igstRow = $('igstRow');
    if (igstRow) igstRow.hidden = calc.supplyType !== 'inter';
    return calc;
  }

  function recalcFromInputs() {
    var inv = state.editor;
    inv.invoiceNumber = val('invoiceNumber');
    inv.invoiceDate = val('invoiceDate');
    inv.dueDate = val('dueDate');
    inv.buyerName = val('buyerName');
    inv.buyerGstin = (val('buyerGstin') || '').toUpperCase().trim();
    inv.buyerAddress = val('buyerAddress');
    inv.buyerEmail = val('buyerEmail');
    inv.buyerState = val('buyerState');
    inv.notes = val('invoiceNotes');
    inv.status = val('invoiceStatus') || 'unpaid';
    var rc = $('reverseCharge');
    if (rc) inv.reverseCharge = rc.checked;

    // Show a live GSTIN verdict next to the field.
    var hint = $('gstinHint');
    if (hint) {
      if (!inv.buyerGstin) { hint.textContent = 'Unregistered buyer – B2C supply'; hint.className = 'field-hint'; }
      else {
        var v = G.validateGSTIN(inv.buyerGstin);
        hint.textContent = v.valid ? 'Valid GSTIN – ' + (v.stateName || '') : 'Invalid: ' + v.reasons[0];
        hint.className = 'field-hint ' + (v.valid ? 'ok' : 'bad');
      }
    }
    renderTotals();
  }

  function val(id) {
    var el = $(id);
    return el ? el.value : '';
  }

  function collectEditor() {
    recalcFromInputs();
    return state.editor;
  }

  function saveInvoice() {
    // Work on a detached copy: while the user edits, state.editor must not be
    // the same object as the record already sitting in state.invoices,
    // otherwise a rejected save leaves the stored invoice corrupted.
    var inv = JSON.parse(JSON.stringify(collectEditor()));
    var errors = G.validateInvoice({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      buyerName: inv.buyerName,
      buyerGstin: inv.buyerGstin,
      buyerState: inv.buyerState,
      sellerGstin: state.settings.gstin,
      lines: inv.lines
    });
    if (errors.length) {
      showErrors(errors);
      return;
    }
    hideErrors();

    var calc = G.calcInvoice(inv);
    var record = Object.assign({}, inv, {
      invoiceNumber: inv.invoiceNumber.trim(),
      buyerGstin: (inv.buyerGstin || '').toUpperCase().trim(),
      updatedAt: new Date().toISOString(),
      computed: {
        taxableValue: calc.totals.taxableValue,
        cgst: calc.totals.cgst,
        sgst: calc.totals.sgst,
        igst: calc.totals.igst,
        cess: calc.totals.cess,
        totalTax: calc.totalTax,
        grandTotal: calc.grandTotal
      }
    });

    if (record.id) {
      var index = state.invoices.findIndex(function (i) { return i.id === record.id; });
      if (index >= 0) state.invoices[index] = record;
      else state.invoices.push(record);
    } else {
      // Reserve the next number from the counter the first time an invoice is saved.
      var reserved = S.nextInvoiceNumber(state.settings.invoicePrefix || 'INV/', 4);
      if (record.invoiceNumber === reserved || !record.invoiceNumber) record.invoiceNumber = reserved;
      record.id = S.uid('inv');
      record.createdAt = new Date().toISOString();
      state.invoices.push(record);
    }
    persist();
    // Keep editing on a copy so later keystrokes cannot touch the saved record.
    state.editor = JSON.parse(JSON.stringify(record));
    toast('Invoice ' + record.invoiceNumber + ' saved', 'ok');
    switchTab('invoices');
  }

  function showErrors(errors) {
    var host = $('formErrors');
    if (!host) { toast(errors[0].message, 'bad'); return; }
    host.innerHTML = '<strong>Please fix the following:</strong><ul>' +
      errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul>';
    host.hidden = false;
    if (typeof host.scrollIntoView === 'function') host.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideErrors() {
    var host = $('formErrors');
    if (host) { host.hidden = true; host.innerHTML = ''; }
  }

  /* ------------------------- invoice list ------------------------- */
  function filteredInvoices() {
    var f = state.filters;
    return state.invoices.filter(function (inv) {
      if (f.status !== 'all' && inv.status !== f.status) return false;
      if (f.month !== 'all' && String(inv.invoiceDate).slice(0, 7) !== f.month) return false;
      if (f.search) {
        var hay = (inv.invoiceNumber + ' ' + inv.buyerName + ' ' + (inv.buyerGstin || '')).toLowerCase();
        if (hay.indexOf(f.search.toLowerCase()) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return String(b.invoiceDate).localeCompare(String(a.invoiceDate)); });
  }

  function renderInvoiceTable() {
    var rows = filteredInvoices();
    var body = $('invoiceBody');
    if (!body) return;
    body.innerHTML = rows.length ? rows.map(function (inv) {
      var calc = G.calcInvoice(inv);
      return '<tr>' +
        '<td><a href="#" data-open="' + esc(inv.id) + '">' + esc(inv.invoiceNumber) + '</a></td>' +
        '<td>' + esc(inv.invoiceDate) + '</td>' +
        '<td>' + esc(inv.buyerName) + '<div class="sub">' + esc(inv.buyerGstin || 'B2C') + '</div></td>' +
        '<td class="num">' + money(calc.totals.taxableValue) + '</td>' +
        '<td class="num">' + money(calc.totalTax) + '</td>' +
        '<td class="num"><strong>' + money(calc.grandTotal) + '</strong></td>' +
        '<td><span class="pill ' + statusClass(inv.status) + '">' + esc(inv.status) + '</span></td>' +
        '<td class="actions">' +
        '<button class="btn-icon" data-print="' + esc(inv.id) + '" title="Print / PDF">🖨</button>' +
        '<button class="btn-icon" data-edit="' + esc(inv.id) + '" title="Edit">✏️</button>' +
        '<button class="btn-icon" data-duplicate="' + esc(inv.id) + '" title="Duplicate">⧉</button>' +
        '<button class="btn-icon" data-toggle-paid="' + esc(inv.id) + '" title="Toggle paid">✓</button>' +
        '<button class="btn-icon danger" data-delete="' + esc(inv.id) + '" title="Delete">🗑</button>' +
        '</td></tr>';
    }).join('') : '<tr><td colspan="8" class="empty">No invoices match this filter.</td></tr>';

    var total = rows.reduce(function (sum, inv) { return sum + G.calcInvoice(inv).grandTotal; }, 0);
    setText('invoiceListTotal', 'Showing ' + rows.length + ' invoice(s) · ' + money(total));

    var months = {};
    state.invoices.forEach(function (inv) { months[String(inv.invoiceDate).slice(0, 7)] = true; });
    var monthSelect = $('filterMonth');
    if (monthSelect) {
      var current = monthSelect.value || 'all';
      monthSelect.innerHTML = '<option value="all">All months</option>' + Object.keys(months).sort().reverse()
        .map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
      monthSelect.value = months[current] ? current : 'all';
    }
  }

  /* ------------------------- print ------------------------- */
  function printInvoice(id) {
    var inv = state.invoices.filter(function (i) { return i.id === id; })[0];
    if (!inv) return;
    var calc = G.calcInvoice(inv);
    var s = state.settings;
    var host = $('printArea');
    if (!host) return;

    var rows = calc.lines.map(function (l, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(l.description) + (l.hsn ? '<div class="sub">HSN/SAC: ' + esc(l.hsn) + '</div>' : '') + '</td>' +
        '<td class="num">' + l.quantity + '</td><td class="num">' + money(l.rate) + '</td>' +
        '<td class="num">' + money(l.discount) + '</td><td class="num">' + l.gstRate + '%</td>' +
        '<td class="num">' + money(l.taxableValue) + '</td><td class="num">' + money(l.lineTotal) + '</td></tr>';
    }).join('');

    var taxRows = calc.supplyType === 'inter'
      ? '<tr><td>IGST</td><td class="num">' + money(calc.totals.igst) + '</td></tr>'
      : '<tr><td>CGST</td><td class="num">' + money(calc.totals.cgst) + '</td></tr>' +
      '<tr><td>SGST</td><td class="num">' + money(calc.totals.sgst) + '</td></tr>';

    host.innerHTML =
      '<div class="invoice-sheet">' +
      '<header class="sheet-head"><div><h2>' + esc(s.businessName || 'Your Business Name') + '</h2>' +
      '<p class="sub">' + esc(s.address || '') + (s.phone ? '<br>Phone: ' + esc(s.phone) : '') + '</p>' +
      '<p class="sub"><strong>GSTIN:</strong> ' + esc(s.gstin || '—') + (s.pan ? ' &nbsp; <strong>PAN:</strong> ' + esc(s.pan) : '') + '</p></div>' +
      '<div class="sheet-title"><h3>TAX INVOICE</h3><p class="sub">' + esc(inv.invoiceNumber) + '</p></div></header>' +
      '<section class="sheet-grid"><div><h4>Billed to</h4><p>' + esc(inv.buyerName) + '</p>' +
      '<p class="sub">' + esc(inv.buyerAddress || '') + '</p>' +
      '<p class="sub">GSTIN: ' + esc(inv.buyerGstin || 'Unregistered (B2C)') + '</p>' +
      '<p class="sub">Place of supply: ' + esc(G.stateName(inv.buyerState) || inv.buyerState || '—') + '</p></div>' +
      '<div><h4>Invoice details</h4><p class="sub">Date: ' + esc(inv.invoiceDate) + '</p>' +
      '<p class="sub">Due: ' + esc(inv.dueDate || '—') + '</p>' +
      '<p class="sub">Supply: ' + (calc.supplyType === 'inter' ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)') + '</p>' +
      '<p class="sub">Reverse charge: ' + (inv.reverseCharge ? 'Yes' : 'No') + '</p></div></section>' +
      '<table class="sheet-table"><thead><tr><th>#</th><th>Description</th><th class="num">Qty</th><th class="num">Rate</th>' +
      '<th class="num">Disc.</th><th class="num">GST</th><th class="num">Taxable</th><th class="num">Amount</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<section class="sheet-totals"><div class="sheet-note"><h4>Amount in words</h4><p class="sub">' + esc(calc.amountInWords) + '</p>' +
      (inv.notes ? '<h4>Notes</h4><p class="sub">' + esc(inv.notes) + '</p>' : '') +
      (s.bankAccount ? '<h4>Bank</h4><p class="sub">' + esc(s.bankName) + ' · A/c ' + esc(s.bankAccount) + ' · IFSC ' + esc(s.bankIfsc) + '</p>' : '') +
      '</div><table><tr><td>Taxable value</td><td class="num">' + money(calc.totals.taxableValue) + '</td></tr>' +
      taxRows +
      (calc.totals.cess ? '<tr><td>Cess</td><td class="num">' + money(calc.totals.cess) + '</td></tr>' : '') +
      '<tr><td>Round off</td><td class="num">' + money(calc.roundOff) + '</td></tr>' +
      '<tr class="grand"><td>Total</td><td class="num">' + money(calc.grandTotal) + '</td></tr></table></section>' +
      '<footer class="sheet-foot"><p class="sub">' + esc(s.terms || '') + '</p>' +
      '<p class="sub">Computer-generated invoice prepared with TaxMitra. This is not a government filing.</p>' +
      '<p class="sign">For ' + esc(s.businessName || 'the seller') + '<br><br>Authorised signatory</p></footer>' +
      '</div>';

    if (typeof window.print === 'function') window.print();
  }

  /* ------------------------- customers & items ------------------------- */
  function renderCustomers() {
    var body = $('customerBody');
    if (!body) return;
    body.innerHTML = state.customers.length ? state.customers.map(function (c) {
      return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.gstin || '—') + '</td>' +
        '<td>' + esc(G.stateName(c.state) || c.state || '—') + '</td>' +
        '<td>' + esc(c.email || '') + '</td><td>' + esc(c.phone || '') + '</td>' +
        '<td class="actions"><button class="btn-icon" data-use-customer="' + esc(c.id) + '" title="New invoice for this customer">🧾</button>' +
        '<button class="btn-icon danger" data-delete-customer="' + esc(c.id) + '" title="Delete">🗑</button></td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty">No customers saved yet.</td></tr>';
  }

  function addCustomer(form) {
    var data = new FormData(form);
    var gstin = String(data.get('gstin') || '').toUpperCase().trim();
    if (gstin && !G.isValidGSTIN(gstin)) {
      toast('That GSTIN is invalid: ' + G.validateGSTIN(gstin).reasons[0], 'bad');
      return false;
    }
    var stateCode = data.get('state') || (gstin ? G.validateGSTIN(gstin).stateCode : state.settings.state);
    state.customers.push({
      id: S.uid('cus'),
      name: String(data.get('name') || '').trim(),
      gstin: gstin,
      state: stateCode,
      email: String(data.get('email') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      address: String(data.get('address') || '').trim()
    });
    persist();
    renderCustomers();
    form.reset();
    toast('Customer added', 'ok');
    return true;
  }

  function renderItems() {
    var body = $('itemBody');
    if (!body) return;
    var settings = state.settings;
    body.innerHTML = state.items.length ? state.items.map(function (it) {
      return '<tr><td>' + esc(it.name) + '</td><td>' + esc(it.hsn || '—') + '</td>' +
        '<td class="num">' + money(it.rate) + '</td><td class="num">' + esc(it.gstRate) + '%</td>' +
        '<td><button class="btn-icon" data-use-item="' + esc(it.id) + '" title="Add to invoice">➕</button>' +
        '<button class="btn-icon danger" data-delete-item="' + esc(it.id) + '" title="Delete">🗑</button></td></tr>';
    }).join('') : '<tr><td colspan="5" class="empty">No saved items yet. Saved items speed up invoicing.</td></tr>';
    void settings;
  }

  function addItem(form) {
    var data = new FormData(form);
    state.items.push({
      id: S.uid('itm'),
      name: String(data.get('name') || '').trim(),
      hsn: String(data.get('hsn') || '').trim(),
      rate: Number(data.get('rate')) || 0,
      gstRate: Number(data.get('gstRate')) || 0
    });
    persist();
    renderItems();
    form.reset();
    toast('Item saved', 'ok');
    return true;
  }

  /* ------------------------- settings ------------------------- */
  function fillSettingsForm() {
    var s = state.settings;
    Object.keys(S.DEFAULT_SETTINGS).forEach(function (key) {
      var el = $('set_' + key);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!s[key];
      else el.value = s[key] === undefined || s[key] === null ? '' : s[key];
    });
    var stateSelect = $('set_state');
    if (stateSelect && !stateSelect.options.length) {
      stateSelect.innerHTML = G.stateList().map(function (st) {
        return '<option value="' + st.code + '">' + st.code + ' – ' + st.name + '</option>';
      }).join('');
    }
    if (stateSelect) stateSelect.value = s.state || '27';
    var hint = $('sellerGstinHint');
    if (hint) {
      var v = s.gstin ? G.validateGSTIN(s.gstin) : null;
      hint.textContent = !s.gstin ? 'Not set' : v.valid ? 'Valid · ' + v.stateName : 'Invalid: ' + (v.reasons[0] || '');
      hint.className = 'field-hint ' + (v && v.valid ? 'ok' : s.gstin ? 'bad' : '');
    }
    setText('counterValue', String(S.peekInvoiceCounter()));
  }

  function saveSettingsForm(form) {
    var data = new FormData(form);
    Object.keys(S.DEFAULT_SETTINGS).forEach(function (key) {
      var el = $('set_' + key);
      if (!el) return;
      state.settings[key] = el.type === 'checkbox' ? el.checked : (data.get(key) !== null ? data.get(key) : state.settings[key]);
    });
    state.settings.nextNumber = Number(state.settings.nextNumber) || 1;
    if (state.settings.gstin && !G.isValidGSTIN(state.settings.gstin)) {
      toast('GSTIN is invalid but settings were saved – fix it before filing GST.', 'warn');
    } else {
      toast('Settings saved', 'ok');
    }
    persist();
    fillSettingsForm();
    renderDashboard();
    return true;
  }

  /* ------------------------- exports ------------------------- */
  function exportGSTR1() {
    var live = state.invoices.filter(function (i) { return i.status !== 'cancelled'; });
    if (!live.length) { toast('Add at least one invoice before exporting GSTR-1', 'warn'); return; }
    var csv = G.buildGSTR1CSV(live);
    download('GSTR1-working-paper-' + today() + '.csv', csv, 'text/csv;charset=utf-8');
    toast('GSTR-1 working paper downloaded – this is not an official GSTN upload file', 'info');
  }

  function exportJSON() {
    download('taxmitra-backup-' + today() + '.json', JSON.stringify(S.exportAll(), null, 2), 'application/json');
    toast('Backup downloaded', 'ok');
  }

  /* ------------------------- events ------------------------- */
  function bindEvents() {
    document.querySelectorAll('[data-tab-btn]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-tab-btn');
        if (tab === 'new' && !state.editor) { openEditor(null); return; }
        switchTab(tab);
      });
    });

    // ---- editor ----
    var addLineBtn = $('addLine');
    if (addLineBtn) addLineBtn.addEventListener('click', function () {
      recalcFromInputs();
      state.editor.lines.push(emptyLine());
      renderLines();
      renderTotals();
    });

    var lineRows = $('lineRows');
    if (lineRows) {
      lineRows.addEventListener('input', function (e) {
        var field = e.target.getAttribute('data-field');
        if (!field) return;
        var tr = e.target.closest('tr[data-line]');
        if (!tr) return;
        var index = Number(tr.getAttribute('data-line'));
        var line = state.editor.lines[index];
        if (!line) return;
        if (field === 'description' || field === 'hsn') line[field] = e.target.value;
        else if (field === 'gstRate') line.gstRate = Number(e.target.value);
        else line[field] = e.target.value === '' ? 0 : Number(e.target.value);
        renderTotals();
        // update only the computed cells of this row, keeping focus
        var calc = G.calcLine(line, { supplyType: currentSupplyType(), priceIncludesTax: state.settings.priceIncludesTax });
        var cells = tr.querySelectorAll('td.num');
        if (cells[0]) cells[0].textContent = money(calc.taxableValue);
        if (cells[1]) cells[1].textContent = money(calc.lineTotal);
      });

      lineRows.addEventListener('change', function (e) {
        if (e.target.getAttribute('data-field') === 'gstRate') renderTotals();
      });

      lineRows.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-remove-line]');
        if (!btn) return;
        var index = Number(btn.getAttribute('data-remove-line'));
        if (state.editor.lines.length === 1) { toast('An invoice needs at least one line', 'warn'); return; }
        state.editor.lines.splice(index, 1);
        renderLines();
        renderTotals();
      });
    }

    ['invoiceNumber', 'invoiceDate', 'dueDate', 'buyerName', 'buyerGstin', 'buyerAddress',
      'buyerEmail', 'buyerState', 'invoiceNotes', 'invoiceStatus'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', recalcFromInputs);
      el.addEventListener('change', function () {
        recalcFromInputs();
        if (id === 'buyerState') { renderLines(); }
      });
    });
    var rc = $('reverseCharge');
    if (rc) rc.addEventListener('change', recalcFromInputs);

    var buyerSelect = $('buyerSelect');
    if (buyerSelect) buyerSelect.addEventListener('change', function () {
      var cust = state.customers.filter(function (c) { return c.id === buyerSelect.value; })[0];
      if (!cust) { state.editor.buyerId = ''; return; }
      state.editor.buyerId = cust.id;
      setValue('buyerName', cust.name);
      setValue('buyerGstin', cust.gstin || '');
      setValue('buyerAddress', cust.address || '');
      setValue('buyerEmail', cust.email || '');
      setValue('buyerState', cust.state || state.settings.state);
      recalcFromInputs();
      renderLines();
    });

    var saveBtn = $('saveInvoice');
    if (saveBtn) saveBtn.addEventListener('click', saveInvoice);
    var newBtn = $('newInvoiceBtn');
    if (newBtn) newBtn.addEventListener('click', function () { openEditor(null); });
    var printDraft = $('printDraft');
    if (printDraft) printDraft.addEventListener('click', function () {
      // Print the draft without saving first.
      var draft = collectEditor();
      state.invoices.push(Object.assign({}, draft, { id: draft.id || 'draft' }));
      printInvoice(draft.id || 'draft');
      state.invoices = state.invoices.filter(function (i) { return i.id !== 'draft'; });
    });

    // ---- invoice list ----
    var search = $('filterSearch');
    if (search) search.addEventListener('input', function () { state.filters.search = search.value; renderInvoiceTable(); });
    var status = $('filterStatus');
    if (status) status.addEventListener('change', function () { state.filters.status = status.value; renderInvoiceTable(); });
    var month = $('filterMonth');
    if (month) month.addEventListener('change', function () { state.filters.month = month.value; renderInvoiceTable(); });

    var body = $('invoiceBody');
    if (body) body.addEventListener('click', function (e) {
      var link = e.target.closest('[data-open]');
      if (link) { e.preventDefault(); openEditor(link.getAttribute('data-open')); return; }
      var print = e.target.closest('[data-print]');
      if (print) { printInvoice(print.getAttribute('data-print')); return; }
      var edit = e.target.closest('[data-edit]');
      if (edit) { openEditor(edit.getAttribute('data-edit')); return; }
      var dup = e.target.closest('[data-duplicate]');
      if (dup) {
        var id = dup.getAttribute('data-duplicate');
        var src = state.invoices.filter(function (i) { return i.id === id; })[0];
        if (!src) return;
        openEditor(null);
        state.editor = Object.assign({}, JSON.parse(JSON.stringify(src)), {
          id: null, invoiceDate: today(), dueDate: addDays(today(), 15), status: 'unpaid', payments: []
        });
        renderEditor();
        setText('editorTitle', 'Duplicate of ' + src.invoiceNumber);
        toast('Duplicated – the new number is assigned when you save', 'info');
        return;
      }
      var paid = e.target.closest('[data-toggle-paid]');
      if (paid) {
        var pid = paid.getAttribute('data-toggle-paid');
        state.invoices = state.invoices.map(function (i) {
          if (i.id !== pid) return i;
          return Object.assign({}, i, { status: i.status === 'paid' ? 'unpaid' : 'paid', paidAt: i.status === 'paid' ? null : new Date().toISOString() });
        });
        persist();
        renderInvoiceTable();
        toast('Status updated', 'ok');
        return;
      }
      var del = e.target.closest('[data-delete]');
      if (del) {
        var did = del.getAttribute('data-delete');
        var target = state.invoices.filter(function (i) { return i.id === did; })[0];
        if (!target) return;
        if (!window.confirm('Delete invoice ' + target.invoiceNumber + '? This cannot be undone.')) return;
        state.invoices = state.invoices.filter(function (i) { return i.id !== did; });
        persist();
        renderInvoiceTable();
        toast('Invoice deleted', 'warn');
      }
    });

    // ---- dashboard recent links ----
    var recent = $('recentBody');
    if (recent) recent.addEventListener('click', function (e) {
      var link = e.target.closest('[data-open]');
      if (!link) return;
      e.preventDefault();
      openEditor(link.getAttribute('data-open'));
    });

    // ---- customers / items ----
    var customerForm = $('customerForm');
    if (customerForm) customerForm.addEventListener('submit', function (e) { e.preventDefault(); addCustomer(customerForm); });
    var itemForm = $('itemForm');
    if (itemForm) itemForm.addEventListener('submit', function (e) { e.preventDefault(); addItem(itemForm); });

    var customerBody = $('customerBody');
    if (customerBody) customerBody.addEventListener('click', function (e) {
      var use = e.target.closest('[data-use-customer]');
      if (use) {
        var cust = state.customers.filter(function (c) { return c.id === use.getAttribute('data-use-customer'); })[0];
        if (!cust) return;
        openEditor(null);
        state.editor.buyerId = cust.id;
        state.editor.buyerName = cust.name;
        state.editor.buyerGstin = cust.gstin || '';
        state.editor.buyerAddress = cust.address || '';
        state.editor.buyerEmail = cust.email || '';
        state.editor.buyerState = cust.state || state.settings.state;
        renderEditor();
        return;
      }
      var del = e.target.closest('[data-delete-customer]');
      if (del) {
        if (!window.confirm('Delete this customer? Existing invoices keep their details.')) return;
        state.customers = state.customers.filter(function (c) { return c.id !== del.getAttribute('data-delete-customer'); });
        persist();
        renderCustomers();
      }
    });

    var itemBody = $('itemBody');
    if (itemBody) itemBody.addEventListener('click', function (e) {
      var use = e.target.closest('[data-use-item]');
      if (use) {
        var item = state.items.filter(function (i) { return i.id === use.getAttribute('data-use-item'); })[0];
        if (!item) return;
        if (!state.editor) openEditor(null);
        else switchTab('new');
        var last = state.editor.lines[state.editor.lines.length - 1];
        var line = { description: item.name, hsn: item.hsn, quantity: 1, rate: item.rate, gstRate: item.gstRate, discount: 0, discountType: 'amount', cessRate: 0 };
        if (last && !last.description && !Number(last.rate)) state.editor.lines[state.editor.lines.length - 1] = line;
        else state.editor.lines.push(line);
        renderLines();
        renderTotals();
        toast(item.name + ' added to the invoice', 'ok');
        return;
      }
      var del = e.target.closest('[data-delete-item]');
      if (del) {
        state.items = state.items.filter(function (i) { return i.id !== del.getAttribute('data-delete-item'); });
        persist();
        renderItems();
      }
    });

    // ---- settings ----
    var settingsForm = $('settingsForm');
    if (settingsForm) settingsForm.addEventListener('submit', function (e) { e.preventDefault(); saveSettingsForm(settingsForm); });

    // ---- exports ----
    ['exportGstr1Btn', 'exportGstr1Btn2'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('click', exportGSTR1);
    });
    var jsonBtn = $('exportJsonBtn');
    if (jsonBtn) jsonBtn.addEventListener('click', exportJSON);

    var clearBtn = $('clearInvoicesBtn');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      if (!window.confirm('Delete ALL invoices? Customers and items are kept. Download a backup first.')) return;
      state.invoices = [];
      persist();
      renderDashboard();
      renderInvoiceTable();
      toast('All invoices deleted', 'warn');
    });

    // ---- keyboard: Ctrl/Cmd+S saves the invoice ----
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && state.activeTab === 'new') {
        e.preventDefault();
        saveInvoice();
      }
    });
  }

  /* ------------------------- boot ------------------------- */
  function init() {
    ['buyerState', 'cstate'].forEach(function (id) {
      var select = $(id);
      if (!select) return;
      select.innerHTML = G.stateList().map(function (st) {
        return '<option value="' + st.code + '">' + st.code + ' – ' + st.name + '</option>';
      }).join('');
      if (id === 'cstate') select.value = state.settings.state || '27';
    });
    bindEvents();
    switchTab('dashboard');
    renderCustomers();
    renderItems();

    // Deep link: billing.html?invoice=<id>
    var params = new URLSearchParams(window.location.search);
    if (params.get('invoice')) openEditor(params.get('invoice'));
    if (params.get('tab')) switchTab(params.get('tab'));
  }

  document.addEventListener('DOMContentLoaded', init);

  // Expose a small surface for debugging and for tests that load this file.
  window.TMBilling = {
    state: state,
    openEditor: openEditor,
    saveInvoice: saveInvoice,
    exportGSTR1: exportGSTR1,
    printInvoice: printInvoice,
    switchTab: switchTab
  };
})();
