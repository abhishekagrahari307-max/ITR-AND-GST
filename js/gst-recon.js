/* ===================================================
   TaxMitra – GSTR-2B ↔ purchase-register reconciliation
   Pure functions only: no DOM, no storage, no network.
   Works in the browser (window.TMGSTRecon) and in Node (require).

   Everything is compared in paise so that ₹0.004 differences
   cannot flip a row from "matched" to "mismatch".

   The Rule 88A set-off order below is implemented from the statute
   (s. 49(5) read with Rule 88A, CGST Rules 2017) — no third-party
   code is copied.
   =================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./gst-billing.js'));
  } else {
    root.TMGSTRecon = factory(root.TMGST);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TMGST) {
  'use strict';

  var GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

  var COLUMNS = {
    gstin: ['gstin', 'gstin of supplier', 'supplier gstin', 'gstin/uin of supplier', 'supplier gstin/uin'],
    invoiceNumber: ['invoice number', 'invoice no', 'invoice no.', 'document number', 'invoice/document number', 'doc no', 'bill no'],
    invoiceDate: ['invoice date', 'document date', 'invoice dt', 'bill date', 'date'],
    taxableValue: ['taxable value', 'taxable amount', 'taxable', 'invoice value', 'amount'],
    igst: ['igst', 'integrated tax', 'igst amount', 'igst amt'],
    cgst: ['cgst', 'central tax', 'cgst amount', 'cgst amt'],
    sgst: ['sgst', 'state tax', 'sgst amount', 'sgst amt', 'utgst'],
    cess: ['cess', 'cess amount', 'cess amt'],
    supplierName: ['supplier name', 'trade name', 'supplier', 'party', 'vendor']
  };

  /* ------------------------- money ------------------------- */

  function money(value) {
    // Accepts "1,18,000.50", "₹1,18,000.5", "(500)" (negative) or numbers.
    if (typeof value === 'number') return TMGST.toPaise(value);
    var text = String(value == null ? '' : value).trim();
    if (!text) return 0;
    var negative = /^\(.*\)$/.test(text) || /^-/.test(text);
    var digits = text.replace(/[^0-9.]/g, '');
    if (!digits) return 0;
    var n = Number(digits);
    if (!isFinite(n)) return 0;
    return TMGST.toPaise(negative ? -n : n);
  }

  function rupees(paise) {
    return TMGST.fromPaise(paise);
  }

  function fmt(paise) {
    return TMGST.formatINR(rupees(paise));
  }

  /* ------------------------- normalising ------------------------- */

  function normGstin(value) {
    return String(value == null ? '' : value).toUpperCase().replace(/[^0-9A-Z]/g, '');
  }

  /** Invoice numbers differ only in punctuation/case between portals and books. */
  function normInvoice(value) {
    return String(value == null ? '' : value)
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      .replace(/^0+(?=\d)/, '');
  }

  /** Accepts DD/MM/YYYY, DD-MM-YY, YYYY-MM-DD, or a Date; returns YYYY-MM-DD or ''. */
  function normDate(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    var text = String(value == null ? '' : value).trim();
    if (!text) return '';
    var iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (iso) return text;
    var dmy = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(text);
    if (dmy) {
      var day = Number(dmy[1]);
      var month = Number(dmy[2]);
      var year = Number(dmy[3]);
      if (year < 100) year += year < 70 ? 2000 : 1900;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      }
    }
    return '';
  }

  function daysBetween(a, b) {
    if (!a || !b) return null;
    var d1 = Date.parse(a + 'T00:00:00Z');
    var d2 = Date.parse(b + 'T00:00:00Z');
    if (isNaN(d1) || isNaN(d2)) return null;
    return Math.abs(Math.round((d2 - d1) / 86400000));
  }

  function emptyRow() {
    return { gstin: '', invoiceNumber: '', invoiceDate: '', taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, supplierName: '' };
  }

  function totalTax(row) {
    return row.igst + row.cgst + row.sgst + row.cess;
  }

  function totalValue(row) {
    return row.taxableValue + totalTax(row);
  }

  /** Coerce one already-parsed object into the canonical row shape (paise). */
  function toRow(raw) {
    // Already canonical (e.g. reconcile() re-normalising parsed rows): keep the
    // paise values as they are instead of converting a second time.
    if (raw && raw.__canonical === true) return raw;
    var row = emptyRow();
    var source = raw || {};
    var igst = source.igst != null ? source.igst : source.integratedTax;
    var cgst = source.cgst != null ? source.cgst : source.centralTax;
    var sgst = source.sgst != null ? source.sgst : (source.utgst != null ? source.utgst : source.stateTax);
    row.gstin = normGstin(source.gstin || source.supplierGstin);
    row.invoiceNumber = String(source.invoiceNumber || source.invoiceNo || source.documentNumber || '').trim();
    row.invoiceDate = normDate(source.invoiceDate || source.documentDate || source.date);
    row.taxableValue = money(source.taxableValue != null ? source.taxableValue : source.taxable);
    row.igst = money(igst);
    row.cgst = money(cgst);
    row.sgst = money(sgst);
    row.cess = money(source.cess);
    row.supplierName = String(source.supplierName || source.tradeName || '').trim();
    row.key = row.gstin + '|' + normInvoice(row.invoiceNumber);
    row.totalTax = totalTax(row);
    row.totalValue = totalValue(row);
    row.__canonical = true;
    return row;
  }

  function mapHeader(header) {
    var clean = String(header || '').toLowerCase().replace(/["']/g, '').replace(/\s+/g, ' ').trim();
    var names = Object.keys(COLUMNS);
    for (var i = 0; i < names.length; i++) {
      var candidates = COLUMNS[names[i]];
      for (var j = 0; j < candidates.length; j++) {
        if (clean === candidates[j]) return names[i];
      }
    }
    // Looser second pass: "Taxable Value (₹)" → taxableValue
    for (var k = 0; k < names.length; k++) {
      var list = COLUMNS[names[k]];
      for (var m = 0; m < list.length; m++) {
        if (clean.indexOf(list[m]) !== -1) return names[k];
      }
    }
    return null;
  }

  /**
   * Parse pasted CSV/TSV (or an array of objects) into canonical rows.
   * Handles quoted fields, comma or tab separators, "₹"/comma-in-number values.
   */
  function parseTable(input) {
    if (Array.isArray(input)) return input.map(toRow);

    var text = String(input == null ? '' : input).replace(/\r\n?/g, '\n').trim();
    if (!text) return [];

    var lines = text.split('\n').filter(function (line) { return line.trim() !== ''; });
    if (!lines.length) return [];

    var separator = (lines[0].indexOf('\t') !== -1 && lines[0].indexOf(',') === -1) ? '\t' : ',';
    var headers = splitLine(lines[0], separator);
    var mapped = headers.map(mapHeader);

    if (mapped.every(function (m) { return m === null; })) {
      throw new Error('No recognisable columns found. The first row must be a header with at least GSTIN, Invoice Number and Taxable Value.');
    }

    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var cells = splitLine(lines[i], separator);
      var raw = {};
      mapped.forEach(function (name, index) {
        if (name) raw[name] = cells[index];
      });
      // Spreadsheets love to append a "Total" row; it is not a credit row.
      var firstCell = String(cells[0] == null ? '' : cells[0]).trim().toLowerCase();
      if (/^(grand )?(total|sub ?total|sum)\b/.test(firstCell)) continue;

      var row = toRow(raw);
      // A usable credit row needs an identifier (GSTIN or invoice number).
      if (!row.gstin && !row.invoiceNumber) continue;
      rows.push(row);
    }
    return rows;
  }

  function splitLine(line, separator) {
    var cells = [];
    var current = '';
    var quoted = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { current += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === separator && !quoted) {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells.map(function (c) { return c.trim().replace(/^="?|"?$/g, ''); });
  }

  /* ------------------------- matching ------------------------- */

  function within(actual, expected, tolerance) {
    return Math.abs(actual - expected) <= tolerance;
  }

  /**
   * Compare the purchase register against GSTR-2B.
   * options: { valueTolerance, taxTolerance (paise), dateWindow (days, 0 = ignore) }
   */
  function reconcile(registerRows, twoBRows, options) {
    var opts = options || {};
    var valueTolerance = opts.valueTolerance == null ? 100 : opts.valueTolerance;  // ₹1
    var taxTolerance = opts.taxTolerance == null ? 100 : opts.taxTolerance;        // ₹1
    var dateWindow = opts.dateWindow == null ? 0 : opts.dateWindow;

    var books = (registerRows || []).map(toRow);
    var portal = (twoBRows || []).map(toRow);

    var portalByKey = {};
    portal.forEach(function (row) {
      if (!portalByKey[row.key]) portalByKey[row.key] = [];
      portalByKey[row.key].push(row);
    });

    var matched = [];
    var valueMismatch = [];
    var taxMismatch = [];
    var onlyInBooks = [];
    var usedPortal = [];

    books.forEach(function (book) {
      var bucket = portalByKey[book.key] || [];
      var partner = null;
      for (var i = 0; i < bucket.length; i++) {
        if (bucket[i].__used) continue;
        if (dateWindow && daysBetween(book.invoiceDate, bucket[i].invoiceDate) > dateWindow) continue;
        partner = bucket[i];
        break;
      }
      if (!partner) {
        onlyInBooks.push(book);
        return;
      }
      partner.__used = true;
      usedPortal.push(partner);

      var valueOk = within(book.taxableValue, partner.taxableValue, valueTolerance);
      var taxOk = within(book.igst, partner.igst, taxTolerance) &&
        within(book.cgst, partner.cgst, taxTolerance) &&
        within(book.sgst, partner.sgst, taxTolerance) &&
        within(book.cess, partner.cess, taxTolerance);

      var entry = { book: book, portal: partner };
      if (valueOk && taxOk) matched.push(entry);
      else if (!valueOk) valueMismatch.push(entry);
      else taxMismatch.push(entry);
    });

    var onlyIn2B = portal.filter(function (row) { return !row.__used; });

    // Legacy: some suppliers file under a different invoice number; surface the
    // candidates instead of silently claiming a mismatch.
    onlyInBooks.forEach(function (book) {
      var candidates = portal.filter(function (row) {
        return !row.__used && row.gstin === book.gstin && within(row.totalValue, book.totalValue, Math.max(valueTolerance + taxTolerance, 200));
      });
      book.possibleMatches = candidates.map(function (c) { return c.invoiceNumber; });
    });

    var result = {
      matched: matched,
      valueMismatch: valueMismatch,
      taxMismatch: taxMismatch,
      onlyInBooks: onlyInBooks,
      onlyIn2B: onlyIn2B,
      summary: summarise(matched, valueMismatch, taxMismatch, onlyInBooks, onlyIn2B)
    };
    // Strip the working flag so callers cannot accidentally rely on it.
    [portal, usedPortal].forEach(function (list) {
      list.forEach(function (row) { delete row.__used; });
    });
    return result;
  }

  function sum(rows, field) {
    return rows.reduce(function (acc, row) { return acc + (row[field] || 0); }, 0);
  }

  function headTotals(rows) {
    return {
      igst: rupees(sum(rows, 'igst')),
      cgst: rupees(sum(rows, 'cgst')),
      sgst: rupees(sum(rows, 'sgst')),
      cess: rupees(sum(rows, 'cess')),
      total: rupees(sum(rows, 'totalTax'))
    };
  }

  function summarise(matched, valueMismatch, taxMismatch, onlyInBooks, onlyIn2B) {
    var fromPortal = matched.map(function (e) { return e.portal; });
    var disputed = valueMismatch.concat(taxMismatch).map(function (e) { return e.portal; });
    var fromBooks = matched.map(function (e) { return e.book; })
      .concat(valueMismatch.concat(taxMismatch).map(function (e) { return e.book; }), onlyInBooks);

    return {
      counts: {
        matched: matched.length,
        valueMismatch: valueMismatch.length,
        taxMismatch: taxMismatch.length,
        onlyInBooks: onlyInBooks.length,
        onlyIn2B: onlyIn2B.length
      },
      itc: {
        // Confirmed: the supplier filed the same invoice with the same figures.
        confirmed: headTotals(fromPortal),
        // Filed, but the books disagree — needs review before it is claimed.
        underReview: headTotals(disputed),
        // In the books only: the supplier has not filed it, so the credit is at risk.
        atRisk: headTotals(onlyInBooks),
        // In 2B only: either a purchase not recorded, or someone else's invoice.
        notInBooks: headTotals(onlyIn2B),
        // Totals for the two documents being compared.
        asPer2B: headTotals(fromPortal.concat(disputed, onlyIn2B)),
        asPerBooks: headTotals(fromBooks)
      }
    };
  }

  /* ------------------------- Rule 88A set-off ------------------------- */

  /**
   * Rule 88A / s.49(5) order:
   *   IGST credit  → IGST, then CGST, then SGST
   *   CGST credit  → CGST, then IGST
   *   SGST/UTGST   → SGST, then IGST
   *   Cess         → Cess only
   * Waives interest on the portion used against IGST? No — this only computes
   * utilisation; the caller decides what to file.
   */
  function setOff(credit, liability) {
    var c = {
      igst: TMGST.toPaise((credit || {}).igst),
      cgst: TMGST.toPaise((credit || {}).cgst),
      sgst: TMGST.toPaise((credit || {}).sgst),
      cess: TMGST.toPaise((credit || {}).cess)
    };
    var l = {
      igst: TMGST.toPaise((liability || {}).igst),
      cgst: TMGST.toPaise((liability || {}).cgst),
      sgst: TMGST.toPaise((liability || {}).sgst),
      cess: TMGST.toPaise((liability || {}).cess)
    };
    var used = { igstCredit: { igst: 0, cgst: 0, sgst: 0 }, cgstCredit: { cgst: 0, igst: 0 }, sgstCredit: { sgst: 0, igst: 0 }, cessCredit: { cess: 0 } };

    function take(available, due) {
      var amount = Math.min(available, due);
      return amount;
    }

    // 1. IGST credit
    var u = take(c.igst, l.igst);
    used.igstCredit.igst = u; c.igst -= u; l.igst -= u;
    u = take(c.igst, l.cgst);
    used.igstCredit.cgst = u; c.igst -= u; l.cgst -= u;
    u = take(c.igst, l.sgst);
    used.igstCredit.sgst = u; c.igst -= u; l.sgst -= u;

    // 2. CGST credit
    u = take(c.cgst, l.cgst);
    used.cgstCredit.cgst = u; c.cgst -= u; l.cgst -= u;
    u = take(c.cgst, l.igst);
    used.cgstCredit.igst = u; c.cgst -= u; l.igst -= u;

    // 3. SGST/UTGST credit
    u = take(c.sgst, l.sgst);
    used.sgstCredit.sgst = u; c.sgst -= u; l.sgst -= u;
    u = take(c.sgst, l.igst);
    used.sgstCredit.igst = u; c.sgst -= u; l.igst -= u;

    // 4. Cess
    u = take(c.cess, l.cess);
    used.cessCredit.cess = u; c.cess -= u; l.cess -= u;

    var remainingLiability = l.igst + l.cgst + l.sgst + l.cess;
    var remainingCredit = c.igst + c.cgst + c.sgst + c.cess;

    function inr(obj) {
      var out = {};
      Object.keys(obj).forEach(function (k) { out[k] = rupees(obj[k]); });
      return out;
    }
    var usedInr = {};
    Object.keys(used).forEach(function (k) { usedInr[k] = inr(used[k]); });

    return {
      used: usedInr,
      usedPaise: used,
      remainingCredit: { igst: rupees(c.igst), cgst: rupees(c.cgst), sgst: rupees(c.sgst), cess: rupees(c.cess) },
      liabilityPaidInCash: { igst: rupees(l.igst), cgst: rupees(l.cgst), sgst: rupees(l.sgst), cess: rupees(l.cess) },
      liabilityPaidInCashTotal: rupees(remainingLiability),
      creditCarriedForward: rupees(remainingCredit),
      totalCreditUsed: rupees(
        used.igstCredit.igst + used.igstCredit.cgst + used.igstCredit.sgst +
        used.cgstCredit.cgst + used.cgstCredit.igst +
        used.sgstCredit.sgst + used.sgstCredit.igst + used.cessCredit.cess
      )
    };
  }

  /* ------------------------- export ------------------------- */

  var CSV_HEADERS = ['Bucket', 'Supplier GSTIN', 'Supplier', 'Invoice Number', 'Invoice Date', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Total Tax', 'Note'];

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function toCsv(result) {
    var lines = [CSV_HEADERS.join(',')];
    function push(bucket, row, note) {
      lines.push([
        bucket, row.gstin, row.supplierName, row.invoiceNumber, row.invoiceDate,
        rupees(row.taxableValue).toFixed(2), rupees(row.igst).toFixed(2), rupees(row.cgst).toFixed(2),
        rupees(row.sgst).toFixed(2), rupees(row.cess).toFixed(2), rupees(row.totalTax).toFixed(2),
        note || ''
      ].map(csvCell).join(','));
    }
    result.matched.forEach(function (e) { push('Matched', e.portal, ''); });
    result.valueMismatch.forEach(function (e) {
      push('Value mismatch', e.portal, 'Books: ' + rupees(e.book.taxableValue).toFixed(2));
    });
    result.taxMismatch.forEach(function (e) { push('Tax mismatch', e.portal, 'Books tax: ' + rupees(e.book.totalTax).toFixed(2)); });
    result.onlyInBooks.forEach(function (row) {
      push('Only in books', row, row.possibleMatches.length ? 'Possible 2B match: ' + row.possibleMatches.join(' / ') : 'Not in 2B — ITC at risk');
    });
    result.onlyIn2B.forEach(function (row) { push('Only in 2B', row, 'Not recorded in books'); });
    return lines.join('\n');
  }

  return {
    COLUMNS: COLUMNS,
    toPaise: TMGST.toPaise,
    money: money,
    rupees: rupees,
    fmt: fmt,
    normGstin: normGstin,
    normInvoice: normInvoice,
    normDate: normDate,
    daysBetween: daysBetween,
    isValidGstin: function (value) { return GSTIN_REGEX.test(normGstin(value)); },
    toRow: toRow,
    parseTable: parseTable,
    splitLine: splitLine,
    reconcile: reconcile,
    setOff: setOff,
    toCsv: toCsv
  };
});
