'use strict';

var t = require('./harness');
var path = require('path');
var G = require(path.join(__dirname, '..', 'js', 'gst-billing.js'));

var suite = t.suite;
var test = t.test;

suite('GST · money helpers', function () {
  test('toPaise rounds to the nearest paisa', function () {
    t.equal(G.toPaise(10.005), 1001);
    t.equal(G.toPaise(0), 0);
    t.equal(G.toPaise('99.99'), 9999);
    t.equal(G.toPaise('not a number'), 0);
  });

  test('fromPaise converts back without drift', function () {
    t.equal(G.fromPaise(1001), 10.01);
    t.equal(G.fromPaise(0), 0);
  });

  test('round2 fixes classic float artefacts', function () {
    t.equal(G.round2(0.1 + 0.2), 0.3);
    t.equal(G.round2(1.005), 1.01);
    t.equal(G.round2(-1.005), -1);
  });

  test('roundToRupee rounds to whole rupees', function () {
    t.equal(G.roundToRupee(1499.4), 1499);
    t.equal(G.roundToRupee(1499.5), 1500);
    t.equal(G.roundToRupee(0), 0);
    t.equal(G.roundToRupee(NaN), 0);
  });

  test('formatINR uses Indian digit grouping', function () {
    t.equal(G.formatINR(1234567.5), '₹12,34,567.50');
    t.equal(G.formatINR(999), '₹999.00');
    t.equal(G.formatINR(100000), '₹1,00,000.00');
    t.equal(G.formatINR(10000000), '₹1,00,00,000.00');
    t.equal(G.formatINR(-4500.256), '-₹4,500.26');
    t.equal(G.formatINR(1500, { decimals: 0 }), '₹1,500');
    t.equal(G.formatINR(1500, { symbol: false }), '1,500.00');
  });
});

suite('GST · amount in words', function () {
  test('small numbers', function () {
    t.equal(G.numberToWords(0), 'Zero');
    t.equal(G.numberToWords(7), 'Seven');
    t.equal(G.numberToWords(15), 'Fifteen');
    t.equal(G.numberToWords(42), 'Forty Two');
    t.equal(G.numberToWords(100), 'One Hundred');
    t.equal(G.numberToWords(999), 'Nine Hundred Ninety Nine');
  });

  test('Indian grouping: thousand, lakh, crore', function () {
    t.equal(G.numberToWords(1000), 'One Thousand');
    t.equal(G.numberToWords(1254300), 'Twelve Lakh Fifty Four Thousand Three Hundred');
    t.equal(G.numberToWords(10000000), 'One Crore');
    t.equal(G.numberToWords(123456789), 'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine');
  });

  test('invoice wording includes rupees and paise', function () {
    t.equal(G.amountInWords(4013), 'Four Thousand Thirteen Rupees Only');
    t.equal(G.amountInWords(1000.5), 'One Thousand Rupees and Fifty Paise Only');
    t.equal(G.amountInWords(0), 'Zero Rupees Only');
  });
});

suite('GST · state codes', function () {
  test('known codes resolve', function () {
    t.equal(G.stateName('27'), 'Maharashtra');
    t.equal(G.stateName('07'), 'Delhi');
    t.equal(G.stateName('29'), 'Karnataka');
    t.equal(G.stateName('38'), 'Ladakh');
    t.equal(G.stateName('97'), 'Other Territory');
  });

  test('unknown codes return null', function () {
    t.equal(G.stateName('28'), null, 'code 28 was Andhra Pradesh before Telangana and is now retired');
    t.equal(G.stateName('99'), null);
    t.equal(G.stateName(''), null);
  });

  test('stateList is sorted and complete', function () {
    var list = G.stateList();
    t.ok(list.length >= 36, 'expected at least 36 states/UTs, got ' + list.length);
    var codes = list.map(function (s) { return s.code; });
    var sorted = codes.slice().sort();
    t.deepEqual(codes, sorted, 'state codes should be sorted');
    t.ok(list.every(function (s) { return /^\d{2}$/.test(s.code) && s.name.length > 2; }));
  });
});

suite('GST · GSTIN validation', function () {
  test('accepts a well-known valid GSTIN', function () {
    var result = G.validateGSTIN('27AAPFU0939F1ZV');
    t.ok(result.valid, 'expected valid, got ' + result.reasons.join('; '));
    t.equal(result.stateCode, '27');
    t.equal(result.stateName, 'Maharashtra');
    t.equal(result.pan, 'AAPFU0939F');
  });

  test('rejects a wrong check digit', function () {
    var result = G.validateGSTIN('27AAPFU0939F1ZX');
    t.notOk(result.valid);
    t.includes(result.reasons.join(' '), 'Check digit mismatch');
  });

  test('rejects wrong lengths and characters', function () {
    t.notOk(G.isValidGSTIN(''));
    t.notOk(G.isValidGSTIN('27AAPF'));
    t.notOk(G.isValidGSTIN('27AAPFU0939F1ZVV'));
    t.ok(G.isValidGSTIN('27aapfu0939f1zv'), 'lowercase input is normalised to uppercase');
    t.notOk(G.isValidGSTIN('27AAPFU0939F2ZV'), 'entity number 0 is not allowed');
  });

  test('is case-insensitive and trims spaces', function () {
    var result = G.validateGSTIN('  27aapfu0939f1zv ');
    t.ok(result.valid, result.reasons.join('; '));
    t.equal(result.gstin, '27AAPFU0939F1ZV');
  });

  test('rejects an invalid state code even with a correct check digit', function () {
    var made = G.makeGSTIN('99', 'AAPFU0939F');
    var result = G.validateGSTIN(made);
    t.notOk(result.valid);
    t.includes(result.reasons.join(' '), 'not a valid GST state code');
  });

  test('makeGSTIN produces values that validate', function () {
    ['27', '07', '29', '33', '09'].forEach(function (code) {
      var gstin = G.makeGSTIN(code, 'AAACR5055A');
      t.equal(gstin.length, 15, 'GSTIN for ' + code + ' should be 15 chars');
      t.ok(G.isValidGSTIN(gstin), code + ' GSTIN should validate: ' + gstin);
    });
  });

  test('check digit is stable for a fixed input', function () {
    t.equal(G.gstinCheckDigit('27AAPFU0939F1Z'), 'V');
    t.equal(G.gstinCheckDigit('07AAACR5055A1Z'), G.gstinCheckDigit('07AAACR5055A1Z'));
  });

  test('null/undefined input is handled without throwing', function () {
    t.notOk(G.isValidGSTIN(null));
    t.notOk(G.isValidGSTIN(undefined));
    t.notOk(G.isValidGSTIN(12345));
  });
});

suite('GST · rate slabs', function () {
  test('GST 2.0 slabs are present', function () {
    var rates = G.GST_SLABS.map(function (s) { return s.rate; });
    t.deepEqual(rates, [0, 5, 12, 18, 28, 40]);
  });

  test('isValidRate accepts only notified slabs', function () {
    [0, 5, 12, 18, 28, 40].forEach(function (r) { t.ok(G.isValidRate(r), r + '% should be valid'); });
    [1, 3, 6, 15, 25, 30, 100].forEach(function (r) { t.notOk(G.isValidRate(r), r + '% should be invalid'); });
  });
});

suite('GST · line calculation', function () {
  test('intra-state splits tax equally with exact paise', function () {
    var line = G.calcLine({ description: 'Widget', quantity: 1, rate: 1000, gstRate: 18 }, { supplyType: 'intra' });
    t.equal(line.taxableValue, 1000);
    t.equal(line.cgst, 90);
    t.equal(line.sgst, 90);
    t.equal(line.igst, 0);
    t.equal(line.lineTotal, 1180);
  });

  test('inter-state puts the whole tax in IGST', function () {
    var line = G.calcLine({ description: 'Widget', quantity: 1, rate: 1000, gstRate: 18 }, { supplyType: 'inter' });
    t.equal(line.igst, 180);
    t.equal(line.cgst, 0);
    t.equal(line.sgst, 0);
  });

  test('odd paise are not lost when halving the tax', function () {
    var line = G.calcLine({ description: 'x', quantity: 1, rate: 99.99, gstRate: 5 }, { supplyType: 'intra' });
    t.close(line.cgst + line.sgst, 5, 0.011, 'CGST + SGST must equal the full 5% of 99.99');
  });

  test('percentage discount is applied before tax', function () {
    var line = G.calcLine({ description: 'Book', quantity: 1, rate: 500, discount: 10, discountType: 'percent', gstRate: 5 }, {});
    t.equal(line.discount, 50);
    t.equal(line.taxableValue, 450);
    t.close(line.cgst + line.sgst, 22.5, 0.011);
  });

  test('amount discount is capped at the line value', function () {
    var line = G.calcLine({ description: 'x', quantity: 1, rate: 100, discount: 500, gstRate: 18 }, {});
    t.equal(line.discount, 100);
    t.equal(line.taxableValue, 0);
    t.equal(line.lineTotal, 0);
  });

  test('tax-inclusive price is backed out correctly', function () {
    var line = G.calcLine({ description: 'x', quantity: 1, rate: 1180, gstRate: 18 }, { priceIncludesTax: true });
    t.equal(line.taxableValue, 1000);
    t.equal(line.cgst, 90);
    t.equal(line.sgst, 90);
  });

  test('cess is added on the taxable value', function () {
    var line = G.calcLine({ description: 'Car', quantity: 1, rate: 100000, gstRate: 40, cessRate: 10 }, {});
    t.equal(line.cess, 10000);
    t.close(line.lineTotal, 150000, 0.01);
  });

  test('negative or nonsense inputs are clamped, not thrown', function () {
    var line = G.calcLine({ quantity: -5, rate: -100, gstRate: 18 }, {});
    t.equal(line.quantity, 0);
    t.equal(line.rate, 0);
    t.equal(line.taxableValue, 0);
    t.equal(line.lineTotal, 0);
  });
});

suite('GST · invoice calculation', function () {
  function sampleInvoice(overrides) {
    var base = {
      sellerState: '27',
      buyerState: '27',
      invoiceNumber: 'INV/1',
      invoiceDate: '2026-04-05',
      buyerName: 'ACME',
      lines: [
        { description: 'Widget', hsn: '8471', quantity: 3, rate: 1000, gstRate: 18 },
        { description: 'Book', hsn: '4901', quantity: 1, rate: 500, gstRate: 5, discount: 10, discountType: 'percent' }
      ]
    };
    Object.keys(overrides || {}).forEach(function (k) { base[k] = overrides[k]; });
    return base;
  }

  test('totals add up across mixed rates', function () {
    var calc = G.calcInvoice(sampleInvoice());
    t.equal(calc.totals.taxableValue, 3450);
    t.equal(calc.totals.cgst, 281.25);
    t.equal(calc.totals.sgst, 281.25);
    t.equal(calc.totals.igst, 0);
    t.equal(calc.totals.discount, 50);
    t.equal(calc.beforeRound, 4012.5);
    t.equal(calc.grandTotal, 4013);
    t.equal(calc.roundOff, 0.5);
    t.equal(calc.totalTax, 562.5);
  });

  test('supply type is derived from the state codes', function () {
    t.equal(G.calcInvoice(sampleInvoice()).supplyType, 'intra');
    t.equal(G.calcInvoice(sampleInvoice({ buyerState: '29' })).supplyType, 'inter');
    t.equal(G.calcInvoice(sampleInvoice({ sellerState: '27', buyerState: '29' })).totals.igst, 562.5);
  });

  test('explicit supply type wins over the state codes', function () {
    var calc = G.calcInvoice(sampleInvoice({ buyerState: '29', supplyType: 'intra' }));
    t.equal(calc.supplyType, 'intra');
    t.ok(calc.totals.cgst > 0);
  });

  test('round-off can be switched off', function () {
    var calc = G.calcInvoice(sampleInvoice({ roundOff: false }));
    t.equal(calc.grandTotal, 4012.5);
    t.equal(calc.roundOff, 0);
  });

  test('an empty invoice does not explode', function () {
    var calc = G.calcInvoice({ lines: [] });
    t.equal(calc.grandTotal, 0);
    t.equal(calc.amountInWords, 'Zero Rupees Only');
    t.equal(calc.totalTax, 0);
  });

  test('missing invoice object is tolerated', function () {
    var calc = G.calcInvoice(undefined);
    t.equal(calc.grandTotal, 0);
    t.equal(calc.lines.length, 0);
  });

  test('rate-wise summary groups by GST rate', function () {
    var calc = G.calcInvoice(sampleInvoice());
    var summary = G.rateWiseSummary(calc.lines);
    t.equal(summary.length, 2);
    t.equal(summary[0].gstRate, 5);
    t.equal(summary[1].gstRate, 18);
    t.close(summary[0].taxableValue + summary[1].taxableValue, 3450, 0.01);
  });

  test('HSN summary groups by HSN and rate', function () {
    var calc = G.calcInvoice(sampleInvoice());
    var hsn = G.hsnSummary(calc.lines);
    t.equal(hsn.length, 2);
    t.equal(hsn[0].hsn, '4901');
    t.equal(hsn[1].hsn, '8471');
    t.equal(hsn[1].quantity, 3);
  });
});

suite('GST · invoice numbering and dates', function () {
  test('nextInvoiceNumber pads and increments', function () {
    t.equal(G.nextInvoiceNumber('INV/', 0, 4), 'INV/0001');
    t.equal(G.nextInvoiceNumber('INV/', 41, 4), 'INV/0042');
    t.equal(G.nextInvoiceNumber('INV/', 9999, 4), 'INV/10000');
    t.equal(G.nextInvoiceNumber('', 5, 2), '06');
    t.equal(G.nextInvoiceNumber('X/', null, 3), 'X/001');
  });

  test('financialYear follows the April–March year', function () {
    t.equal(G.financialYear('2026-04-01'), '2026-27');
    t.equal(G.financialYear('2026-03-31'), '2025-26');
    t.equal(G.financialYear('2026-12-31'), '2026-27');
    t.equal(G.financialYear('2027-01-15'), '2026-27');
    t.equal(G.financialYear(new Date('2026-05-10T00:00:00Z')), '2026-27');
  });

  test('financialYear handles bad dates', function () {
    t.equal(G.financialYear('not-a-date'), null);
    t.equal(G.financialYear(undefined) === null || typeof G.financialYear(undefined) === 'string', true);
  });

  test('isValidDate rejects impossible dates', function () {
    t.ok(G.isValidDate('2026-02-28'));
    t.ok(G.isValidDate('2024-02-29'), '2024 is a leap year');
    t.notOk(G.isValidDate('2026-02-29'), '2026 is not a leap year');
    t.notOk(G.isValidDate('2026-02-30'));
    t.notOk(G.isValidDate('2026-13-01'));
    t.notOk(G.isValidDate('05-04-2026'));
    t.notOk(G.isValidDate(''));
  });

  test('dateToDDMMYYYY converts ISO dates', function () {
    t.equal(G.dateToDDMMYYYY('2026-04-05'), '05-04-2026');
    t.equal(G.dateToDDMMYYYY('bad'), '');
  });
});

suite('GST · invoice validation', function () {
  var valid = {
    invoiceNumber: 'INV/0001',
    invoiceDate: '2026-04-05',
    buyerName: 'ACME',
    buyerState: '27',
    lines: [{ description: 'Widget', quantity: 1, rate: 1000, gstRate: 18 }]
  };

  test('a good invoice passes', function () {
    t.deepEqual(G.validateInvoice(valid), []);
  });

  test('required fields are reported', function () {
    var errors = G.validateInvoice({ lines: [] });
    var fields = errors.map(function (e) { return e.field; });
    t.includes(fields, 'invoiceNumber');
    t.includes(fields, 'invoiceDate');
    t.includes(fields, 'buyerName');
    t.includes(fields, 'lines');
  });

  test('bad GSTINs are reported with the underlying reason', function () {
    var errors = G.validateInvoice(Object.assign({}, valid, { buyerGstin: '27AAPFU0939F1ZX' }));
    t.equal(errors.length, 1);
    t.includes(errors[0].message, 'Check digit mismatch');
  });

  test('place of supply must match the buyer GSTIN state', function () {
    var errors = G.validateInvoice(Object.assign({}, valid, { buyerGstin: '27AAPFU0939F1ZV', buyerState: '29' }));
    t.equal(errors.length, 1);
    t.includes(errors[0].message, 'does not match');
  });

  test('unregistered buyers still need a place of supply', function () {
    var errors = G.validateInvoice(Object.assign({}, valid, { buyerState: '' }));
    t.equal(errors.length, 1);
    t.equal(errors[0].field, 'buyerState');
  });

  test('line-level problems point at the right line', function () {
    var errors = G.validateInvoice(Object.assign({}, valid, {
      lines: [
        { description: 'ok', quantity: 1, rate: 10, gstRate: 18 },
        { description: '', quantity: 0, rate: -5, gstRate: 7 }
      ]
    }));
    var fields = errors.map(function (e) { return e.field; });
    t.includes(fields, 'lines.1.description');
    t.includes(fields, 'lines.1.quantity');
    t.includes(fields, 'lines.1.rate');
    t.includes(fields, 'lines.1.gstRate');
  });

  test('invalid seller GSTIN is flagged too', function () {
    var errors = G.validateInvoice(Object.assign({}, valid, { sellerGstin: 'BADGSTIN' }));
    t.equal(errors.length, 1);
    t.equal(errors[0].field, 'sellerGstin');
  });
});

suite('GST · CSV export', function () {
  test('csvEscape quotes commas, quotes and newlines', function () {
    t.equal(G.csvEscape('plain'), 'plain');
    t.equal(G.csvEscape('a,b'), '"a,b"');
    t.equal(G.csvEscape('say "hi"'), '"say ""hi"""');
    t.equal(G.csvEscape('line1\nline2'), '"line1\nline2"');
    t.equal(G.csvEscape(null), '');
  });

  test('toCSV joins with CRLF', function () {
    t.equal(G.toCSV([['a', 'b'], ['c', 'd']]), 'a,b\r\nc,d');
    t.equal(G.toCSV([]), '');
  });

  test('GSTR-1 working paper contains the expected sections', function () {
    var csv = G.buildGSTR1CSV([{
      invoiceNumber: 'INV/0001', invoiceDate: '2026-04-05', buyerName: 'ACME',
      buyerGstin: '27AAPFU0939F1ZV', buyerState: '27',
      lines: [{ description: 'Widget', hsn: '8471', quantity: 1, rate: 1000, gstRate: 18 }]
    }]);
    t.includes(csv, 'NOT AN OFFICIAL GSTN UPLOAD FILE');
    t.includes(csv, '4A – B2B SUPPLIES');
    t.includes(csv, '7 – B2C SUPPLIES');
    t.includes(csv, '12 – HSN SUMMARY');
    t.includes(csv, '05-04-2026');
    t.includes(csv, '27AAPFU0939F1ZV');
    t.includes(csv, '90.00', 'the 18% split should appear as 90.00 CGST on a ₹1,000 line');
  });

  test('cancelled invoices are excluded from the working paper', function () {
    var csv = G.buildGSTR1CSV([{
      invoiceNumber: 'INV/CANCELLED', invoiceDate: '2026-04-05', buyerName: 'X', buyerGstin: '27AAPFU0939F1ZV',
      buyerState: '27', status: 'cancelled', lines: [{ description: 'x', quantity: 1, rate: 100, gstRate: 18 }]
    }]);
    t.notOk(csv.indexOf('INV/CANCELLED') !== -1, 'cancelled invoice should not be exported');
  });

  test('B2C invoices land in the B2C section, not B2B', function () {
    var csv = G.buildGSTR1CSV([{
      invoiceNumber: 'INV/0002', invoiceDate: '2026-04-06', buyerName: 'Walk-in', buyerState: '27',
      lines: [{ description: 'Snack', quantity: 1, rate: 100, gstRate: 5 }]
    }]);
    var parts = csv.split('7 – B2C SUPPLIES');
    t.notOk(parts[0].indexOf('INV/0002') !== -1, 'B2C invoice must not appear in the B2B block');
    // B2C is summarised by place of supply + rate, so the invoice number itself is not repeated.
    t.includes(parts[1], '27,5%,100.00', 'B2C summary should carry state, rate and taxable value');
    t.notOk(csv.indexOf('INV/0002') !== -1, 'B2C invoice numbers are not carried into the summary');
  });
});

suite('GST · ageing report', function () {
  test('buckets unpaid invoices by due date', function () {
    var invoices = [
      { status: 'unpaid', dueDate: '2026-05-01', lines: [{ description: 'a', quantity: 1, rate: 100, gstRate: 0 }] },
      { status: 'unpaid', dueDate: '2026-03-25', lines: [{ description: 'b', quantity: 1, rate: 200, gstRate: 0 }] },
      { status: 'unpaid', dueDate: '2026-02-20', lines: [{ description: 'c', quantity: 1, rate: 300, gstRate: 0 }] },
      { status: 'unpaid', dueDate: '2026-01-10', lines: [{ description: 'd', quantity: 1, rate: 400, gstRate: 0 }] },
      { status: 'paid', dueDate: '2026-01-01', lines: [{ description: 'e', quantity: 1, rate: 500, gstRate: 0 }] }
    ];
    var ageing = G.ageingReport(invoices, '2026-04-15');
    t.equal(ageing.current, 100, 'due 1 May is not yet due');
    t.equal(ageing.days30, 200, 'due 25 Mar is 21 days overdue');
    t.equal(ageing.days60, 300, 'due 20 Feb is 54 days overdue');
    t.equal(ageing.days90, 0);
    t.equal(ageing.over90, 400, 'due 10 Jan is 95 days overdue');
  });

  test('empty input yields zero buckets', function () {
    var ageing = G.ageingReport([], '2026-04-15');
    Object.keys(ageing).forEach(function (k) { t.equal(ageing[k], 0, k + ' should be 0'); });
  });
});
