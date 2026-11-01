/* ===================================================
   TaxMitra – Shared GST / Billing Helpers
   Pure functions only: no DOM, no storage, no network.
   Works in the browser (window.TMGST) and in Node (require).
   =================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TMGST = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* -------------------------------------------------
     Money helpers – all arithmetic is done in paise
     (integer) so that ₹0.1 + ₹0.2 style errors cannot
     creep into invoices or GSTR working papers.
     ------------------------------------------------- */
  function toPaise(amount) {
    var n = Number(amount);
    if (!isFinite(n)) return 0;
    // Exponent-shift trick: Number('1.005e2') is exactly 100.5, whereas
    // 1.005 * 100 is 100.49999999999999 and would round the wrong way.
    if (Math.abs(n) < 1e15) return Math.round(Number(n + 'e2'));
    return Math.round(n * 100);
  }

  function fromPaise(paise) {
    return Math.round(Number(paise) || 0) / 100;
  }

  function round2(amount) {
    return fromPaise(toPaise(amount));
  }

  /** Round to the nearest rupee the way an invoice does. */
  function roundToRupee(amount) {
    var n = Number(amount);
    if (!isFinite(n)) return 0;
    return Math.round(n);
  }

  /** Format as Indian currency string, e.g. 1234567.5 -> "12,34,567.50". */
  function formatINR(amount, options) {
    var opts = options || {};
    var decimals = opts.decimals === undefined ? 2 : opts.decimals;
    var n = Number(amount) || 0;
    var negative = n < 0;
    var abs = Math.abs(n).toFixed(decimals);
    var parts = abs.split('.');
    var whole = parts[0];
    var frac = parts[1];
    var last3 = whole.slice(-3);
    var rest = whole.slice(0, -3);
    if (rest) last3 = ',' + last3;
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    var out = rest + last3 + (decimals > 0 ? '.' + frac : '');
    if (opts.symbol !== false) out = '₹' + out;
    return (negative ? '-' : '') + out;
  }

  /* -------------------------------------------------
     Indian number-to-words for invoice totals.
     ------------------------------------------------- */
  var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigits(n) {
    if (n < 20) return ONES[n];
    var t = Math.floor(n / 10), o = n % 10;
    return TENS[t] + (o ? ' ' + ONES[o] : '');
  }

  function threeDigits(n) {
    var h = Math.floor(n / 100), rest = n % 100;
    var out = '';
    if (h) out += ONES[h] + ' Hundred';
    if (rest) out += (out ? ' ' : '') + twoDigits(rest);
    return out;
  }

  /** 1254300 -> "Twelve Lakh Fifty Four Thousand Three Hundred" */
  function numberToWords(amount) {
    var n = Math.floor(Math.abs(Number(amount) || 0));
    if (n === 0) return 'Zero';
    var crore = Math.floor(n / 10000000);
    var lakh = Math.floor((n % 10000000) / 100000);
    var thousand = Math.floor((n % 100000) / 1000);
    var hundred = n % 1000;
    var parts = [];
    if (crore) parts.push(numberToWords(crore) + ' Crore');
    if (lakh) parts.push(twoDigits(lakh) + ' Lakh');
    if (thousand) parts.push(twoDigits(thousand) + ' Thousand');
    if (hundred) parts.push(threeDigits(hundred));
    var words = parts.join(' ').replace(/\s+/g, ' ').trim();
    return (Number(amount) < 0 ? 'Minus ' : '') + words;
  }

  /** Invoice-style amount in words including paise. */
  function amountInWords(amount) {
    var n = round2(amount);
    var rupees = Math.floor(Math.abs(n));
    var paise = Math.round((Math.abs(n) - rupees) * 100);
    var out = numberToWords(rupees) + ' Rupees';
    if (paise) out += ' and ' + twoDigits(paise) + ' Paise';
    return out + ' Only';
  }

  /* -------------------------------------------------
     States / Union Territories (GST state codes)
     ------------------------------------------------- */
  var STATE_CODES = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
    '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
    '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
    '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
    '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
    '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
    '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
    '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
    '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
    '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh',
    '38': 'Ladakh', '97': 'Other Territory'
  };

  function stateName(code) {
    return STATE_CODES[String(code || '')] || null;
  }

  function stateList() {
    return Object.keys(STATE_CODES).sort().map(function (code) {
      return { code: code, name: STATE_CODES[code] };
    });
  }

  /* -------------------------------------------------
     GSTIN validation, including the mod-36 check digit
     ------------------------------------------------- */
  var GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  var GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

  function gstinCheckDigit(first14) {
    var sum = 0;
    for (var i = 0; i < 14; i++) {
      var value = GSTIN_CHARS.indexOf(first14[i]);
      if (value < 0) return null;
      var factor = (i % 2 === 0) ? 1 : 2;
      var product = value * factor;
      sum += Math.floor(product / 36) + (product % 36);
    }
    return GSTIN_CHARS[(36 - (sum % 36)) % 36];
  }

  /**
   * Validate a GSTIN. Returns { valid, reasons[], stateCode, stateName, pan }.
   * Never throws – bad input simply fails validation.
   */
  function validateGSTIN(input) {
    var reasons = [];
    var gstin = String(input == null ? '' : input).toUpperCase().replace(/\s+/g, '');
    var result = { valid: false, gstin: gstin, reasons: reasons, stateCode: null, stateName: null, pan: null };

    if (!gstin) { reasons.push('GSTIN is empty'); return result; }
    if (gstin.length !== 15) reasons.push('GSTIN must be exactly 15 characters');
    if (!GSTIN_REGEX.test(gstin)) reasons.push('GSTIN does not match the prescribed 15-character pattern');
    if (reasons.length) return result; // further checks need a well-formed string

    var code = gstin.slice(0, 2);
    result.stateCode = code;
    result.stateName = stateName(code);
    result.pan = gstin.slice(2, 12);
    if (!result.stateName) reasons.push('State code ' + code + ' is not a valid GST state code');
    if (!PAN_REGEX.test(result.pan)) reasons.push('Characters 3-12 must be a valid PAN');

    var expected = gstinCheckDigit(gstin.slice(0, 14));
    if (expected && expected !== gstin[14]) {
      reasons.push('Check digit mismatch: expected "' + expected + '" but found "' + gstin[14] + '"');
    }

    result.valid = reasons.length === 0;
    return result;
  }

  function isValidGSTIN(input) {
    return validateGSTIN(input).valid;
  }

  /** Build a GSTIN from PAN + state code (used by the tests and by the demo GSTIN helper). */
  function makeGSTIN(stateCode, pan, entityNumber) {
    var first14 = String(stateCode) + String(pan) + String(entityNumber || 1) + 'Z';
    if (first14.length !== 14) return null;
    var check = gstinCheckDigit(first14);
    return check ? first14 + check : null;
  }

  /* -------------------------------------------------
     GST rate slabs (post GST 2.0, 22 Sep 2025)
     ------------------------------------------------- */
  var GST_SLABS = [
    { rate: 0, label: 'Nil / Exempt', note: 'Fresh produce, health & education services, individual life/health insurance' },
    { rate: 5, label: '5% – essentials', note: 'Packaged food, medicines, toiletries, hotels up to ₹7,500/night, restaurants' },
    { rate: 12, label: '12% – legacy', note: 'Only where a specific entry still notifies 12% (verify against your HSN)' },
    { rate: 18, label: '18% – standard', note: 'Most goods and professional/business services, cement, white goods, small cars' },
    { rate: 28, label: '28% – legacy', note: 'Residual entries pending re-notification (verify against your HSN)' },
    { rate: 40, label: '40% – sin & luxury', note: 'Tobacco, pan masala, aerated drinks, luxury cars, casinos, online gaming' }
  ];

  function isValidRate(rate) {
    return GST_SLABS.some(function (s) { return s.rate === Number(rate); });
  }

  /* -------------------------------------------------
     Line item + invoice computation
     ------------------------------------------------- */
  /**
   * Compute a single invoice line.
   * @param {Object} line  { description, hsn, quantity, rate, gstRate, discount, discountType, cessRate }
   *   rate         – unit price, GST exclusive
   *   discount     – amount, or percentage when discountType === 'percent'
   *   gstRate      – 0/5/12/18/28/40
   *   cessRate     – compensation cess %, default 0
   * @param {Object} ctx   { supplyType: 'intra' | 'inter', priceIncludesTax?: boolean }
   */
  function calcLine(line, ctx) {
    var options = ctx || {};
    var supplyType = options.supplyType === 'inter' ? 'inter' : 'intra';
    var gstRate = Number(line.gstRate) || 0;
    var cessRate = Number(line.cessRate) || 0;
    var quantity = line.quantity === undefined || line.quantity === '' ? 1 : Number(line.quantity);
    var unitRate = Number(line.rate) || 0;
    if (!isFinite(quantity) || quantity < 0) quantity = 0;
    if (!isFinite(unitRate) || unitRate < 0) unitRate = 0;

    var grossPaise = Math.round(quantity * unitRate * 100);

    // If the user typed a tax-inclusive price, back it out first.
    if (options.priceIncludesTax) {
      var divisor = 1 + (gstRate + cessRate) / 100;
      grossPaise = Math.round(grossPaise / divisor);
    }

    var discountPaise = 0;
    if (line.discountType === 'percent') {
      var pct = Math.min(Math.max(Number(line.discount) || 0, 0), 100);
      discountPaise = Math.round(grossPaise * pct / 100);
    } else {
      discountPaise = Math.min(Math.max(toPaise(line.discount), 0), grossPaise);
    }

    var taxablePaise = grossPaise - discountPaise;
    var gstPaise = Math.round(taxablePaise * (gstRate / 100));
    var cessPaise = Math.round(taxablePaise * (cessRate / 100));

    var cgst = 0, sgst = 0, igst = 0;
    if (supplyType === 'inter') {
      igst = gstPaise;
    } else {
      cgst = Math.floor(gstPaise / 2);
      sgst = gstPaise - cgst; // keep the paise exact
    }

    return {
      description: String(line.description || ''),
      hsn: String(line.hsn || ''),
      quantity: quantity,
      rate: fromPaise(Math.round(unitRate * 100)),
      discount: fromPaise(discountPaise),
      taxableValue: fromPaise(taxablePaise),
      gstRate: gstRate,
      cessRate: cessRate,
      cgst: fromPaise(cgst),
      sgst: fromPaise(sgst),
      igst: fromPaise(igst),
      cess: fromPaise(cessPaise),
      lineTotal: fromPaise(taxablePaise + gstPaise + cessPaise)
    };
  }

  /**
   * Compute a whole invoice.
   * @param {Object} invoice { lines[], supplyType, sellerState, buyerState, roundOff }
   */
  function calcInvoice(invoice) {
    var inv = invoice || {};
    var lines = Array.isArray(inv.lines) ? inv.lines : [];

    // Supply type: explicit, else derived from states, else intra.
    var supplyType = inv.supplyType;
    if (supplyType !== 'inter' && supplyType !== 'intra') {
      supplyType = (inv.sellerState && inv.buyerState && inv.sellerState !== inv.buyerState)
        ? 'inter' : 'intra';
    }

    var computed = lines.map(function (line) {
      return calcLine(line, { supplyType: supplyType, priceIncludesTax: !!inv.priceIncludesTax });
    });

    var totals = {
      taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, discount: 0, grossValue: 0
    };
    computed.forEach(function (l) {
      totals.taxableValue = round2(totals.taxableValue + l.taxableValue);
      totals.cgst = round2(totals.cgst + l.cgst);
      totals.sgst = round2(totals.sgst + l.sgst);
      totals.igst = round2(totals.igst + l.igst);
      totals.cess = round2(totals.cess + l.cess);
      totals.discount = round2(totals.discount + l.discount);
      totals.grossValue = round2(totals.grossValue + l.quantity * l.rate);
    });

    var beforeRound = round2(totals.taxableValue + totals.cgst + totals.sgst + totals.igst + totals.cess);
    var roundOff = 0;
    var grandTotal = beforeRound;
    if (inv.roundOff !== false) {
      grandTotal = roundToRupee(beforeRound);
      roundOff = round2(grandTotal - beforeRound);
    }

    return {
      lines: computed,
      supplyType: supplyType,
      totals: totals,
      totalTax: round2(totals.cgst + totals.sgst + totals.igst + totals.cess),
      beforeRound: beforeRound,
      roundOff: roundOff,
      grandTotal: grandTotal,
      amountInWords: amountInWords(grandTotal)
    };
  }

  /** Group taxable value and tax by GST rate – the shape GSTR-1 wants. */
  function rateWiseSummary(lines) {
    var map = {};
    (lines || []).forEach(function (line) {
      var key = String(line.gstRate);
      if (!map[key]) {
        map[key] = { gstRate: line.gstRate, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
      }
      map[key].taxableValue = round2(map[key].taxableValue + (line.taxableValue || 0));
      map[key].cgst = round2(map[key].cgst + (line.cgst || 0));
      map[key].sgst = round2(map[key].sgst + (line.sgst || 0));
      map[key].igst = round2(map[key].igst + (line.igst || 0));
      map[key].cess = round2(map[key].cess + (line.cess || 0));
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return a.gstRate - b.gstRate; });
  }

  /** HSN-wise summary for the HSN table of GSTR-1. */
  function hsnSummary(lines) {
    var map = {};
    (lines || []).forEach(function (line) {
      var key = String(line.hsn || '') + '|' + String(line.gstRate);
      if (!map[key]) {
        map[key] = { hsn: line.hsn || '', gstRate: line.gstRate, quantity: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
      }
      map[key].quantity = round2(map[key].quantity + (line.quantity || 0));
      map[key].taxableValue = round2(map[key].taxableValue + (line.taxableValue || 0));
      map[key].cgst = round2(map[key].cgst + (line.cgst || 0));
      map[key].sgst = round2(map[key].sgst + (line.sgst || 0));
      map[key].igst = round2(map[key].igst + (line.igst || 0));
      map[key].cess = round2(map[key].cess + (line.cess || 0));
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return String(a.hsn).localeCompare(String(b.hsn)); });
  }

  /* -------------------------------------------------
     Invoice numbering + validation
     ------------------------------------------------- */
  /** Build a sequential invoice number, e.g. prefix "TM/2026-27/" + 1 => "TM/2026-27/0001". */
  function nextInvoiceNumber(prefix, lastNumber, padding) {
    var pad = padding === undefined ? 4 : padding;
    var n = (Number(lastNumber) || 0) + 1;
    var str = String(n);
    while (str.length < pad) str = '0' + str;
    return String(prefix || '') + str;
  }

  /** Indian financial year label for a date: 2026-05-10 -> "2026-27". */
  function financialYear(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return null;
    var y = d.getFullYear();
    var startYear = d.getMonth() >= 3 ? y : y - 1; // April is month index 3
    var endShort = String((startYear + 1) % 100);
    if (endShort.length < 2) endShort = '0' + endShort;
    return startYear + '-' + endShort;
  }

  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  /** Strict YYYY-MM-DD check that also rejects 2026-02-30. */
  function isValidDate(input) {
    var m = DATE_RE.exec(String(input || ''));
    if (!m) return false;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }

  /**
   * Invoice-level validation used before saving.
   * Returns an array of { field, message } (empty = valid).
   */
  function validateInvoice(invoice) {
    var inv = invoice || {};
    var errors = [];
    var push = function (field, message) { errors.push({ field: field, message: message }); };

    if (!inv.invoiceNumber || !String(inv.invoiceNumber).trim()) push('invoiceNumber', 'Invoice number is required');
    if (!isValidDate(inv.invoiceDate)) push('invoiceDate', 'Invoice date must be a real date in YYYY-MM-DD format');
    if (!inv.buyerName || !String(inv.buyerName).trim()) push('buyerName', 'Buyer name is required');

    if (!inv.buyerGstin) {
      if (!inv.buyerState) push('buyerState', 'Place of supply is required for unregistered buyers');
    } else if (!isValidGSTIN(inv.buyerGstin)) {
      push('buyerGstin', 'Buyer GSTIN is invalid: ' + validateGSTIN(inv.buyerGstin).reasons[0]);
    }
    if (inv.sellerGstin && !isValidGSTIN(inv.sellerGstin)) {
      push('sellerGstin', 'Seller GSTIN is invalid: ' + validateGSTIN(inv.sellerGstin).reasons[0]);
    }

    var lines = Array.isArray(inv.lines) ? inv.lines : [];
    if (!lines.length) push('lines', 'Add at least one line item');
    lines.forEach(function (line, i) {
      var label = 'lines.' + i;
      if (!line.description || !String(line.description).trim()) push(label + '.description', 'Line ' + (i + 1) + ': description is required');
      if (Number(line.quantity) <= 0) push(label + '.quantity', 'Line ' + (i + 1) + ': quantity must be greater than zero');
      if (Number(line.rate) < 0 || !isFinite(Number(line.rate))) push(label + '.rate', 'Line ' + (i + 1) + ': rate must be zero or more');
      if (!isValidRate(line.gstRate)) push(label + '.gstRate', 'Line ' + (i + 1) + ': GST rate must be one of 0/5/12/18/28/40');
    });

    // A registered buyer's GSTIN state must match the chosen place of supply.
    if (inv.buyerGstin && isValidGSTIN(inv.buyerGstin) && inv.buyerState) {
      var gstinState = validateGSTIN(inv.buyerGstin).stateCode;
      if (gstinState !== String(inv.buyerState)) {
        push('buyerState', 'Place of supply does not match the state in the buyer GSTIN');
      }
    }
    return errors;
  }

  /* -------------------------------------------------
     CSV export (working papers, not government upload)
     ------------------------------------------------- */
  function csvEscape(value) {
    var s = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(rows) {
    return (rows || []).map(function (row) {
      return (row || []).map(csvEscape).join(',');
    }).join('\r\n');
  }

  function dateToDDMMYYYY(iso) {
    if (!isValidDate(iso)) return '';
    var p = iso.split('-');
    return p[2] + '-' + p[1] + '-' + p[0];
  }

  /**
   * Build a GSTR-1 working-paper CSV.
   * Sections: B2B (registered buyers), B2C summary, HSN summary.
   * This is NOT an official GSTN upload file – it is a reconciliation working paper.
   */
  function buildGSTR1CSV(invoices) {
    var list = (invoices || []).filter(function (i) { return i && i.status !== 'cancelled'; });
    var rows = [];

    rows.push(['GSTR-1 WORKING PAPER (NOT AN OFFICIAL GSTN UPLOAD FILE)']);
    rows.push(['Generated by TaxMitra on', new Date().toISOString().slice(0, 10)]);
    rows.push([]);

    // ---- B2B ----
    rows.push(['4A – B2B SUPPLIES (registered buyers)']);
    rows.push(['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice Date',
      'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Rate',
      'Taxable Value', 'CGST', 'SGST', 'IGST', 'Cess']);

    var b2b = list.filter(function (i) { return i.buyerGstin; });
    b2b.forEach(function (inv) {
      var calc = calcInvoice(inv);
      rateWiseSummary(calc.lines).forEach(function (r) {
        rows.push([
          inv.buyerGstin, inv.buyerName || '', inv.invoiceNumber, dateToDDMMYYYY(inv.invoiceDate),
          calc.grandTotal.toFixed(2), inv.buyerState || '', inv.reverseCharge ? 'Y' : 'N',
          r.gstRate + '%', r.taxableValue.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2),
          r.igst.toFixed(2), r.cess.toFixed(2)
        ]);
      });
    });
    if (!b2b.length) rows.push(['(no B2B invoices)']);
    rows.push([]);

    // ---- B2C ----
    rows.push(['7 – B2C SUPPLIES (unregistered buyers)']);
    rows.push(['Place Of Supply', 'Rate', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Cess']);
    var b2cMap = {};
    list.filter(function (i) { return !i.buyerGstin; }).forEach(function (inv) {
      var calc = calcInvoice(inv);
      rateWiseSummary(calc.lines).forEach(function (r) {
        var key = (inv.buyerState || '') + '|' + r.gstRate;
        if (!b2cMap[key]) b2cMap[key] = { state: inv.buyerState || '', gstRate: r.gstRate, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
        b2cMap[key].taxableValue = round2(b2cMap[key].taxableValue + r.taxableValue);
        b2cMap[key].cgst = round2(b2cMap[key].cgst + r.cgst);
        b2cMap[key].sgst = round2(b2cMap[key].sgst + r.sgst);
        b2cMap[key].igst = round2(b2cMap[key].igst + r.igst);
        b2cMap[key].cess = round2(b2cMap[key].cess + r.cess);
      });
    });
    var b2cKeys = Object.keys(b2cMap);
    if (!b2cKeys.length) rows.push(['(no B2C invoices)']);
    b2cKeys.forEach(function (k) {
      var r = b2cMap[k];
      rows.push([r.state, r.gstRate + '%', r.taxableValue.toFixed(2), r.cgst.toFixed(2),
        r.sgst.toFixed(2), r.igst.toFixed(2), r.cess.toFixed(2)]);
    });
    rows.push([]);

    // ---- HSN ----
    rows.push(['12 – HSN SUMMARY']);
    rows.push(['HSN/SAC', 'Description', 'UQC', 'Quantity', 'Rate', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Cess']);
    var hsnMap = {};
    list.forEach(function (inv) {
      var calc = calcInvoice(inv);
      calc.lines.forEach(function (l) {
        var key = (l.hsn || '') + '|' + l.gstRate;
        if (!hsnMap[key]) {
          hsnMap[key] = { hsn: l.hsn || '', desc: l.description || '', gstRate: l.gstRate, quantity: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
        }
        hsnMap[key].quantity = round2(hsnMap[key].quantity + l.quantity);
        hsnMap[key].taxableValue = round2(hsnMap[key].taxableValue + l.taxableValue);
        hsnMap[key].cgst = round2(hsnMap[key].cgst + l.cgst);
        hsnMap[key].sgst = round2(hsnMap[key].sgst + l.sgst);
        hsnMap[key].igst = round2(hsnMap[key].igst + l.igst);
        hsnMap[key].cess = round2(hsnMap[key].cess + l.cess);
      });
    });
    var hsnKeys = Object.keys(hsnMap);
    if (!hsnKeys.length) rows.push(['(no line items)']);
    hsnKeys.forEach(function (k) {
      var h = hsnMap[k];
      rows.push([h.hsn, h.desc, 'NOS', h.quantity, h.gstRate + '%', h.taxableValue.toFixed(2),
        h.cgst.toFixed(2), h.sgst.toFixed(2), h.igst.toFixed(2), h.cess.toFixed(2)]);
    });

    return toCSV(rows);
  }

  /**
   * Outstanding / ageing report for the billing dashboard.
   * Buckets are relative to `asOn` (ISO date string).
   */
  function ageingReport(invoices, asOn) {
    var end = asOn ? new Date(asOn + 'T00:00:00Z') : new Date();
    var buckets = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
    (invoices || []).forEach(function (inv) {
      if (!inv || inv.status === 'paid' || inv.status === 'cancelled') return;
      var total = calcInvoice(inv).grandTotal;
      var due = inv.dueDate && isValidDate(inv.dueDate) ? new Date(inv.dueDate + 'T00:00:00Z') : end;
      var days = Math.floor((end - due) / 86400000);
      if (days <= 0) buckets.current += total;
      else if (days <= 30) buckets.days30 += total;
      else if (days <= 60) buckets.days60 += total;
      else if (days <= 90) buckets.days90 += total;
      else buckets.over90 += total;
    });
    Object.keys(buckets).forEach(function (k) { buckets[k] = round2(buckets[k]); });
    return buckets;
  }

  return {
    // money
    toPaise: toPaise, fromPaise: fromPaise, round2: round2, roundToRupee: roundToRupee,
    formatINR: formatINR, numberToWords: numberToWords, amountInWords: amountInWords,
    // states
    STATE_CODES: STATE_CODES, stateName: stateName, stateList: stateList,
    // GSTIN
    validateGSTIN: validateGSTIN, isValidGSTIN: isValidGSTIN, makeGSTIN: makeGSTIN,
    gstinCheckDigit: gstinCheckDigit,
    // rates
    GST_SLABS: GST_SLABS, isValidRate: isValidRate,
    // calculation
    calcLine: calcLine, calcInvoice: calcInvoice, rateWiseSummary: rateWiseSummary, hsnSummary: hsnSummary,
    // numbering / dates
    nextInvoiceNumber: nextInvoiceNumber, financialYear: financialYear, isValidDate: isValidDate,
    // validation + export
    validateInvoice: validateInvoice, csvEscape: csvEscape, toCSV: toCSV,
    dateToDDMMYYYY: dateToDDMMYYYY, buildGSTR1CSV: buildGSTR1CSV, ageingReport: ageingReport
  };
});
