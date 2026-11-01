/* ===================================================
   TaxMitra – ITC reconciliation page controller
   Depends on: js/gst-billing.js, js/gst-recon.js, js/tm-store.js, js/session-boot.js

   Nothing here invents data. The textareas start empty, the saved working is
   only what the user pasted, and every number on the page comes from
   TMGSTRecon.
   =================================================== */
(function () {
  'use strict';

  var R = window.TMGSTRecon;
  var S = window.TMStore;
  var STORE_KEY = 'tm-itc-recon';
  var result = null;

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function inr(amount) {
    try {
      return '₹' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) {
      return '₹' + Number(amount || 0).toFixed(2);
    }
  }

  function toast(message, type) {
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
      (type === 'bad' ? '#ef4444' : type === 'warn' ? '#f59e0b' : '#10b981');
    host.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }

  function msg(text, kind) {
    var el = $('inputMsg');
    if (!el) return;
    el.className = 'alert ' + (kind || 'info');
    el.textContent = text;
    el.style.display = 'block';
    el.style.marginTop = '1rem';
    el.style.marginBottom = '0';
  }

  /* ------------------------- saved working ------------------------- */

  function loadSaved() {
    if (!S) return null;
    return S.read(STORE_KEY, null);
  }

  function saveWorking() {
    if (!S) { toast('Storage is unavailable in this browser.', 'warn'); return; }
    var payload = {
      books: $('booksInput').value,
      portal: $('portalInput').value,
      liability: {
        igst: $('liabIgst').value, cgst: $('liabCgst').value,
        sgst: $('liabSgst').value, cess: $('liabCess').value
      },
      savedAt: new Date().toISOString()
    };
    if (!payload.books.trim() && !payload.portal.trim()) { toast('Nothing to save yet.', 'warn'); return; }
    if (S.write(STORE_KEY, payload)) {
      toast('Working saved on this browser' + (S.getNamespace() ? ' (account profile)' : ''), 'ok');
    } else {
      toast('Could not save — the browser storage may be full.', 'bad');
    }
  }

  function restoreSaved() {
    var saved = loadSaved();
    if (!saved) return;
    $('booksInput').value = saved.books || '';
    $('portalInput').value = saved.portal || '';
    if (saved.liability) {
      $('liabIgst').value = saved.liability.igst || '';
      $('liabCgst').value = saved.liability.cgst || '';
      $('liabSgst').value = saved.liability.sgst || '';
      $('liabCess').value = saved.liability.cess || '';
    }
    msg('Restored the working you saved on this browser (' + new Date(saved.savedAt).toLocaleString('en-IN') + ').', 'info');
  }

  /* ------------------------- invoices → register ------------------------- */

  function fillFromInvoices() {
    if (!S) { toast('Storage is unavailable.', 'bad'); return; }
    var invoices = S.list('invoices');
    if (!invoices.length) {
      msg('You have no saved invoices yet. Create one in Billing, or paste your register below.', 'warn');
      return;
    }
    var lines = ['GSTIN,Supplier Name,Invoice Number,Invoice Date,Taxable Value,IGST,CGST,SGST'];
    var used = 0;
    invoices.forEach(function (invoice) {
      var lines2 = invoice.lines || [];
      var taxable = 0, igst = 0, cgst = 0, sgst = 0;
      lines2.forEach(function (line) {
        var qty = Number(line.quantity) || 0;
        var rate = Number(line.rate) || 0;
        var gstRate = Number(line.gstRate) || 0;
        var base = qty * rate;
        taxable += base;
        // Intra-state supplies split the GST rate evenly between CGST and SGST.
        if (invoice.buyerState && invoice.sellerState && invoice.buyerState === invoice.sellerState) {
          cgst += base * gstRate / 200;
          sgst += base * gstRate / 200;
        } else {
          igst += base * gstRate / 100;
        }
      });
      // Only purchases that carry a supplier GSTIN can produce input credit.
      var gstin = invoice.supplierGstin || invoice.sellerGstin || '';
      if (!gstin) return;
      used += 1;
      lines.push([
        gstin,
        '"' + String(invoice.buyerName || invoice.supplierName || '').replace(/"/g, '""') + '"',
        invoice.invoiceNumber || '',
        R.normDate(invoice.invoiceDate) || invoice.invoiceDate || '',
        taxable.toFixed(2), igst.toFixed(2), cgst.toFixed(2), sgst.toFixed(2)
      ].join(','));
    });
    if (!used) {
      msg('None of your saved invoices record a supplier GSTIN, so there is no input credit to reconcile yet.', 'warn');
      return;
    }
    $('booksInput').value = lines.join('\n');
    msg('Filled ' + used + ' invoice(s) from your saved books. Check the GSTIN direction (this page treats the saved invoices as purchases).', 'ok');
  }

  /* ------------------------- rendering ------------------------- */

  function kpi(label, value, sub, cls) {
    return '<div class="kpi ' + cls + '"><div class="kpi-label">' + esc(label) + '</div>' +
      '<div class="kpi-value">' + esc(value) + '</div><div class="kpi-sub">' + esc(sub) + '</div></div>';
  }

  function renderSummary(res) {
    var itc = res.summary.itc;
    var counts = res.summary.counts;
    $('kpiGrid').innerHTML = [
      kpi('Confirmed ITC', inr(itc.confirmed.total), counts.matched + ' invoice(s) matched', 'ok'),
      kpi('Under review', inr(itc.underReview.total), (counts.valueMismatch + counts.taxMismatch) + ' mismatch(es)', 'review'),
      kpi('At risk', inr(itc.atRisk.total), counts.onlyInBooks + ' not in 2B', 'risk'),
      kpi('Not in books', inr(itc.notInBooks.total), counts.onlyIn2B + ' from 2B only', 'extra')
    ].join('');

    var heads = [['IGST', 'igst'], ['CGST', 'cgst'], ['SGST', 'sgst'], ['Cess', 'cess'], ['Total', 'total']];
    $('totalsBody').innerHTML = heads.map(function (pair) {
      var label = pair[0], key = pair[1];
      var per2b = itc.asPer2B[key];
      var perBooks = itc.asPerBooks[key];
      var diff = Number((per2b - perBooks).toFixed(2));
      var cls = key === 'total' ? ' class="strong-row"' : '';
      return '<tr' + cls + '><td>' + label + '</td><td class="num">' + inr(per2b) + '</td><td class="num">' +
        inr(perBooks) + '</td><td class="num" style="color:' + (diff === 0 ? 'var(--success)' : 'var(--danger)') + '">' +
        (diff === 0 ? '—' : inr(diff)) + '</td></tr>';
    }).join('');
  }

  function rowCells(row) {
    return '<td>' + esc(row.gstin || '—') + '</td>' +
      '<td>' + esc(row.supplierName || '—') + '</td>' +
      '<td>' + esc(row.invoiceNumber || '—') + '</td>' +
      '<td>' + esc(row.invoiceDate || '—') + '</td>' +
      '<td class="num">' + inr(R.rupees(row.taxableValue)) + '</td>' +
      '<td class="num">' + inr(R.rupees(row.totalTax)) + '</td>';
  }

  var TABLE_HEAD = '<thead><tr><th>GSTIN</th><th>Supplier</th><th>Invoice</th><th>Date</th>' +
    '<th class="num">Taxable value</th><th class="num">Tax</th></tr></thead>';

  function bucket(title, rows, note, extra) {
    if (!rows.length) return '';
    var body = rows.map(function (row) {
      return '<tr>' + rowCells(row) + (extra ? '<td>' + extra(row) + '</td>' : '') + '</tr>';
    }).join('');
    return '<div class="bucket"><h3>' + esc(title) + ' <span class="count">' + rows.length + '</span></h3>' +
      (note ? '<p class="muted-note" style="margin-bottom:0.5rem">' + note + '</p>' : '') +
      '<div class="table-wrap"><table class="tm-table">' + TABLE_HEAD + '<tbody>' + body + '</tbody></table></div></div>';
  }

  function renderBuckets(res) {
    var html = '';
    html += bucket('✅ Matched', res.matched.map(function (e) { return e.portal; }),
      'Supplier filed the invoice with the same taxable value and tax.');
    html += bucket('⚠️ Value mismatch', res.valueMismatch.map(function (e) { return e.portal; }),
      'Taxable value differs. The books figure is shown in the last column.',
      function (row) {
        var entry = res.valueMismatch.filter(function (e) { return e.portal === row; })[0];
        return 'Books: ' + inr(R.rupees(entry.book.taxableValue));
      });
    html += bucket('⚠️ Tax mismatch', res.taxMismatch.map(function (e) { return e.portal; }),
      'Taxable value agrees but the tax heads do not.',
      function (row) {
        var entry = res.taxMismatch.filter(function (e) { return e.portal === row; })[0];
        return 'Books tax: ' + inr(R.rupees(entry.book.totalTax));
      });
    html += bucket('🔴 Only in your books (credit at risk)', res.onlyInBooks,
      'The supplier has not reported these invoices. ITC cannot be claimed until they do.',
      function (row) {
        return row.possibleMatches && row.possibleMatches.length
          ? 'Possible 2B match: ' + esc(row.possibleMatches.join(' / '))
          : 'Not filed by the supplier';
      });
    html += bucket('🔵 Only in 2B (not in your books)', res.onlyIn2B,
      'Either a purchase you have not recorded, or an invoice issued to someone else.');

    if (!html) {
      html = '<div class="empty-state"><span class="big">📄</span><p>' +
        'Both documents are empty, so there is nothing to reconcile. Paste your register and the 2B above and press Reconcile.</p></div>';
    }
    $('buckets').innerHTML = html;
  }

  function renderAll(res) {
    result = res;
    $('resultSection').hidden = false;
    renderSummary(res);
    renderBuckets(res);
    $('csvBtn').disabled = false;
    var counts = res.summary.counts;
    var total = counts.matched + counts.valueMismatch + counts.taxMismatch + counts.onlyInBooks + counts.onlyIn2B;
    msg('Reconciled ' + total + ' row(s): ' + counts.matched + ' matched, ' +
      (counts.valueMismatch + counts.taxMismatch) + ' mismatch(es), ' + counts.onlyInBooks +
      ' only in books, ' + counts.onlyIn2B + ' only in 2B.', counts.onlyInBooks || counts.valueMismatch || counts.taxMismatch ? 'warn' : 'ok');
  }

  /* ------------------------- actions ------------------------- */

  function reconcile() {
    var booksText = $('booksInput').value.trim();
    var portalText = $('portalInput').value.trim();
    if (!booksText && !portalText) {
      msg('Paste at least one document first — the reconciliation needs data.', 'warn');
      $('resultSection').hidden = true;
      $('csvBtn').disabled = true;
      return;
    }
    try {
      var books = R.parseTable(booksText);
      var portal = R.parseTable(portalText);
      if (!books.length && !portal.length) {
        msg('No usable rows found. Check that the first row is a header and that the GSTIN / invoice columns are present.', 'bad');
        $('resultSection').hidden = true;
        $('csvBtn').disabled = true;
        return;
      }
      renderAll(R.reconcile(books, portal));
    } catch (error) {
      $('resultSection').hidden = true;
      $('csvBtn').disabled = true;
      msg('Could not read that paste: ' + error.message, 'bad');
    }
  }

  function exportCsv() {
    if (!result) return;
    var csv = R.toCsv(result);
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'itc-reconciliation-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('CSV exported (' + csv.split('\n').length + ' rows).', 'ok');
  }

  function computeSetOff() {
    if (!result) { toast('Reconcile first — the set-off uses confirmed credit.', 'warn'); return; }
    var credit = result.summary.itc.confirmed;
    var out = R.setOff(
      { igst: credit.igst, cgst: credit.cgst, sgst: credit.sgst, cess: credit.cess },
      {
        igst: $('liabIgst').value, cgst: $('liabCgst').value,
        sgst: $('liabSgst').value, cess: $('liabCess').value
      }
    );
    var u = out.used;
    var rows = [
      ['IGST credit', u.igstCredit.igst, u.igstCredit.cgst, u.igstCredit.sgst, 0],
      ['CGST credit', u.cgstCredit.igst, u.cgstCredit.cgst, 0, 0],
      ['SGST credit', u.sgstCredit.igst, 0, u.sgstCredit.sgst, 0],
      ['Cess credit', 0, 0, 0, u.cessCredit.cess]
    ];
    $('setoffBody').innerHTML = rows.map(function (row) {
      return '<tr><td>' + row[0] + '</td><td class="num">' + inr(row[1]) + '</td><td class="num">' + inr(row[2]) +
        '</td><td class="num">' + inr(row[3]) + '</td><td class="num">' + inr(row[4]) + '</td></tr>';
    }).join('') +
      '<tr class="strong-row"><td>Total credit used</td><td class="num" colspan="4">' + inr(out.totalCreditUsed) + '</td></tr>';
    $('setoffResult').hidden = false;
    $('setoffSummary').textContent =
      'Liability paid in cash: ' + inr(out.liabilityPaidInCashTotal) +
      ' · Credit carried forward: ' + inr(out.creditCarriedForward) +
      ' · Only confirmed (matched) credit is used — disputed and at-risk credit is excluded on purpose.';
  }

  function clearAll() {
    if (!window.confirm('Clear the pasted documents and the saved working on this browser?')) return;
    $('booksInput').value = '';
    $('portalInput').value = '';
    ['liabIgst', 'liabCgst', 'liabSgst', 'liabCess'].forEach(function (id) { $(id).value = ''; });
    $('resultSection').hidden = true;
    $('setoffResult').hidden = true;
    $('csvBtn').disabled = true;
    result = null;
    if (S) S.remove(STORE_KEY);
    msg('Cleared. Nothing is left on this browser.', 'info');
  }

  function init() {
    if (!R) {
      var err = $('appError');
      if (err) { err.style.display = 'block'; err.textContent = 'js/gst-recon.js did not load, so reconciliation is unavailable.'; }
      return;
    }
    var bind = function (id, event, handler) {
      var el = $(id);
      if (el) el.addEventListener(event, handler);
    };
    bind('reconcileBtn', 'click', reconcile);
    bind('csvBtn', 'click', exportCsv);
    bind('saveBtn', 'click', saveWorking);
    bind('clearBtn', 'click', clearAll);
    bind('setoffBtn', 'click', computeSetOff);
    bind('loadInvoicesBtn', 'click', fillFromInvoices);
    restoreSaved();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.TMITCRecon = { reconcile: reconcile, computeSetOff: computeSetOff, exportCsv: exportCsv, saveWorking: saveWorking };
})();
