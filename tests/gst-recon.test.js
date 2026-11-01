'use strict';

var t = require('./harness');
var path = require('path');

var R = require(path.join(__dirname, '..', 'js', 'gst-recon.js'));
var suite = t.suite;
var test = t.test;

/* A realistic purchase register: one clean intra-state purchase, one inter-state,
   one that a supplier never reported, one with a value mismatch. */
var BOOKS_CSV = [
  'GSTIN,Supplier Name,Invoice Number,Invoice Date,Taxable Value,IGST,CGST,SGST',
  '27AAPFU0939F1ZV,Sharma Traders,INV/001,01/04/2026,"1,00,000",0,9000,9000',
  '29ABCDE1234F1Z5,Karnataka Supplies,INV-002,05/04/2026,50000,9000,0,0',
  '27AABCU9603R1ZM,Unreported Vendor,INV/003,10/04/2026,20000,0,1800,1800',
  '07AAACR5055K1Z7,Delhi Goods,INV/004,12/04/2026,30000,0,2700,2700'
].join('\n');

var TWO_B_CSV = [
  'GSTIN,Invoice Number,Invoice Date,Taxable Value,IGST,CGST,SGST',
  '27AAPFU0939F1ZV,INV001,01-04-2026,100000,0,9000,9000',
  '29ABCDE1234F1Z5,INV002,05-04-2026,50000,9000,0,0',
  '07AAACR5055K1Z7,INV004,12-04-2026,25000,0,2250,2250',
  '33AAGCB1234M1ZP,INV-777,15/04/2026,40000,0,3600,3600'
].join('\n');

suite('GST recon · money parsing', function () {
  test('plain numbers, currency symbols and Indian commas parse to paise', function () {
    t.equal(R.money('118000'), 11800000);
    t.equal(R.money('1,18,000.50'), 11800050);
    t.equal(R.money('₹9,000'), 900000);
    t.equal(R.money(9000), 900000);
  });

  test('parentheses and a leading minus both mean negative', function () {
    t.equal(R.money('(500)'), -50000);
    t.equal(R.money('-500.25'), -50025);
  });

  test('junk and blanks become zero rather than NaN', function () {
    ['', null, undefined, 'abc', '--'].forEach(function (value) {
      t.equal(R.money(value), 0, JSON.stringify(value));
    });
    t.equal(R.rupees(0), 0);
  });
});

suite('GST recon · normalising', function () {
  test('GSTIN is upper-cased and stripped of separators', function () {
    t.equal(R.normGstin(' 27aapfu0939f1zv '), '27AAPFU0939F1ZV');
    t.equal(R.isValidGstin('27AAPFU0939F1ZV'), true);
    t.equal(R.isValidGstin('27AAPFU0939F1Z'), false);
  });

  test('invoice numbers match despite punctuation, case and leading zeros', function () {
    t.equal(R.normInvoice('INV/2026-27/001'), 'INV202627001');
    t.equal(R.normInvoice('inv-2026-27-001'), 'INV202627001');
    t.equal(R.normInvoice('INV/001'), R.normInvoice('INV001'));
  });

  test('dates parse from DD/MM/YYYY, DD-MM-YY and ISO', function () {
    t.equal(R.normDate('01/04/2026'), '2026-04-01');
    t.equal(R.normDate('1-4-26'), '2026-04-01');
    t.equal(R.normDate('2026-04-01'), '2026-04-01');
    t.equal(R.normDate('not a date'), '');
  });

  test('day differences are absolute', function () {
    t.equal(R.daysBetween('2026-04-01', '2026-04-11'), 10);
    t.equal(R.daysBetween('2026-04-11', '2026-04-01'), 10);
    t.equal(R.daysBetween('', '2026-04-01'), null);
  });
});

suite('GST recon · parsing pasted data', function () {
  test('a pasted CSV becomes canonical rows in paise', function () {
    var rows = R.parseTable(BOOKS_CSV);
    t.equal(rows.length, 4);
    t.equal(rows[0].gstin, '27AAPFU0939F1ZV');
    t.equal(rows[0].supplierName, 'Sharma Traders');
    t.equal(rows[0].taxableValue, 10000000);
    t.equal(rows[0].cgst, 900000);
    t.equal(rows[0].invoiceDate, '2026-04-01');
    t.equal(rows[0].totalTax, 1800000);
    t.equal(rows[0].totalValue, 11800000);
  });

  test('quoted fields containing commas survive', function () {
    var rows = R.parseTable('GSTIN,Invoice Number,Taxable Value,Supplier Name\n27AAPFU0939F1ZV,INV1,1000,"Rao, Sons & Co"');
    t.equal(rows[0].supplierName, 'Rao, Sons & Co');
  });

  test('tab-separated pastes work too', function () {
    var rows = R.parseTable('GSTIN\tInvoice Number\tTaxable Value\n27AAPFU0939F1ZV\tINV1\t1000');
    t.equal(rows.length, 1);
    t.equal(rows[0].taxableValue, 100000);
  });

  test('blank rows and totals rows are skipped', function () {
    var rows = R.parseTable('GSTIN,Invoice Number,Taxable Value\n27AAPFU0939F1ZV,INV1,1000\n,,\nTotal,,1000');
    t.equal(rows.length, 1);
  });

  test('alternate GSTR-2B headers are recognised', function () {
    var rows = R.parseTable('GSTIN/UIN of Supplier,Invoice/Document Number,Document Date,Taxable Value,Integrated Tax,Central Tax,State Tax\n27AAPFU0939F1ZV,INV1,01-04-2026,1000,0,90,90');
    t.equal(rows[0].gstin, '27AAPFU0939F1ZV');
    t.equal(rows[0].cgst, 9000);
    t.equal(rows[0].sgst, 9000);
  });

  test('unusable input throws a helpful error instead of guessing', function () {
    t.throws(function () { R.parseTable('foo,bar\n1,2'); });
    t.deepEqual(R.parseTable(''), []);
    t.deepEqual(R.parseTable(null), []);
  });

  test('parsing twice does not double the amounts', function () {
    var once = R.parseTable(BOOKS_CSV);
    var twice = R.reconcile(once, R.parseTable(TWO_B_CSV));
    t.equal(twice.matched[0].portal.taxableValue, 10000000, 'still ₹1,00,000 in paise');
  });
});

suite('GST recon · matching', function () {
  var result = R.reconcile(R.parseTable(BOOKS_CSV), R.parseTable(TWO_B_CSV));

  test('the clean rows match despite different invoice punctuation', function () {
    t.equal(result.summary.counts.matched, 2);
    t.equal(result.matched[0].book.invoiceNumber, 'INV/001');
    t.equal(result.matched[0].portal.invoiceNumber, 'INV001');
  });

  test('a value difference lands in its own bucket', function () {
    t.equal(result.valueMismatch.length, 1);
    t.equal(result.valueMismatch[0].book.taxableValue, 3000000);
    t.equal(result.valueMismatch[0].portal.taxableValue, 2500000);
  });

  test('invoices the supplier never filed are reported, not hidden', function () {
    t.equal(result.onlyInBooks.length, 1);
    t.equal(result.onlyInBooks[0].invoiceNumber, 'INV/003');
  });

  test('2B invoices missing from the books are reported too', function () {
    t.equal(result.onlyIn2B.length, 1);
    t.equal(result.onlyIn2B[0].invoiceNumber, 'INV-777');
  });

  test('counts add up to the number of rows on each side', function () {
    var booksSide = result.summary.counts.matched + result.summary.counts.valueMismatch +
      result.summary.counts.taxMismatch + result.summary.counts.onlyInBooks;
    var portalSide = result.summary.counts.matched + result.summary.counts.valueMismatch +
      result.summary.counts.taxMismatch + result.summary.counts.onlyIn2B;
    t.equal(booksSide, 4);
    t.equal(portalSide, 4);
  });

  test('ITC available comes from the portal, not from hope', function () {
    t.equal(result.summary.itc.confirmed.igst, 9000);
    t.equal(result.summary.itc.confirmed.cgst, 9000);
    t.equal(result.summary.itc.confirmed.total, 27000);
    t.equal(result.summary.itc.underReview.total, 4500, 'the disputed invoice is counted separately');
    t.equal(result.summary.itc.notInBooks.total, 7200);
    t.equal(result.summary.itc.atRisk.total, 3600);
    t.equal(result.summary.itc.asPer2B.total, 38700);
    t.equal(result.summary.itc.asPerBooks.total, 36000);
  });

  test('tolerance can absorb rounding differences', function () {
    var books = R.parseTable('GSTIN,Invoice Number,Taxable Value,IGST\n27AAPFU0939F1ZV,INV1,1000.00,180.00');
    var portal = R.parseTable('GSTIN,Invoice Number,Taxable Value,IGST\n27AAPFU0939F1ZV,INV1,1000.00,180.50');
    t.equal(R.reconcile(books, portal).summary.counts.matched, 1, '₹0.50 is inside the default ₹1 tolerance');
    t.equal(R.reconcile(books, portal, { taxTolerance: 10 }).summary.counts.taxMismatch, 1, 'tightening to ₹0.10 exposes it');
  });

  test('a tax-only difference is classified as a tax mismatch', function () {
    var books = R.parseTable('GSTIN,Invoice Number,Taxable Value,IGST\n27AAPFU0939F1ZV,INV1,1000,180');
    var portal = R.parseTable('GSTIN,Invoice Number,Taxable Value,IGST\n27AAPFU0939F1ZV,INV1,1000,90');
    var res = R.reconcile(books, portal);
    t.equal(res.taxMismatch.length, 1);
    t.equal(res.valueMismatch.length, 0);
  });

  test('the date window can reject a match', function () {
    var books = R.parseTable('GSTIN,Invoice Number,Invoice Date,Taxable Value\n27AAPFU0939F1ZV,INV1,01/04/2026,1000');
    var portal = R.parseTable('GSTIN,Invoice Number,Invoice Date,Taxable Value\n27AAPFU0939F1ZV,INV1,20/05/2026,1000');
    t.equal(R.reconcile(books, portal, { dateWindow: 30 }).summary.counts.matched, 0);
    t.equal(R.reconcile(books, portal).summary.counts.matched, 1, 'window 0 means ignore the date');
  });

  test('a likely counterpart is suggested when the invoice number differs', function () {
    var books = R.parseTable('GSTIN,Invoice Number,Taxable Value,IGST\n27AAPFU0939F1ZV,BC/101,10000,1800');
    var portal = R.parseTable('GSTIN,Invoice Number,Taxable Value,IGST\n27AAPFU0939F1ZV,SLASH-999,10000,1800');
    var res = R.reconcile(books, portal);
    t.equal(res.onlyInBooks.length, 1);
    t.deepEqual(res.onlyInBooks[0].possibleMatches, ['SLASH-999']);
  });

  test('empty inputs reconcile to an empty, valid result', function () {
    var empty = R.reconcile([], []);
    t.equal(empty.summary.counts.matched, 0);
    t.equal(empty.summary.itc.asPer2B.total, 0);
    t.equal(empty.matched.length, 0);
  });
});

suite('GST recon · Rule 88A set-off', function () {
  test('IGST credit is used against IGST first, then CGST, then SGST', function () {
    var out = R.setOff({ igst: 10000 }, { igst: 8000, cgst: 5000, sgst: 6000 });
    t.equal(out.used.igstCredit.igst, 8000);
    t.equal(out.used.igstCredit.cgst, 2000);
    t.equal(out.used.igstCredit.sgst, 0, 'nothing left for SGST');
    t.equal(out.liabilityPaidInCash.sgst, 6000);
  });

  test('CGST credit pays CGST then IGST; SGST credit pays SGST then IGST', function () {
    var out = R.setOff({ cgst: 5000, sgst: 5000 }, { cgst: 3000, sgst: 3000, igst: 4000 });
    t.equal(out.used.cgstCredit.cgst, 3000);
    t.equal(out.used.cgstCredit.igst, 2000);
    t.equal(out.used.sgstCredit.sgst, 3000);
    t.equal(out.used.sgstCredit.igst, 2000);
    t.equal(out.liabilityPaidInCashTotal, 0);
  });

  test('SGST credit can never pay CGST', function () {
    var out = R.setOff({ sgst: 5000 }, { cgst: 5000 });
    t.equal(out.used.sgstCredit.sgst, 0);
    t.equal(out.liabilityPaidInCash.cgst, 5000);
    t.equal(out.creditCarriedForward, 5000);
  });

  test('cess is ring-fenced', function () {
    var out = R.setOff({ cess: 1000, cgst: 0 }, { cgst: 1000, cess: 400 });
    t.equal(out.used.cessCredit.cess, 400);
    t.equal(out.liabilityPaidInCash.cgst, 1000);
    t.equal(out.creditCarriedForward, 600);
  });

  test('excess liability is paid in cash and excess credit carries forward', function () {
    var out = R.setOff({ igst: 1000, cgst: 1000, sgst: 1000 }, { igst: 500, cgst: 500, sgst: 2500 });
    // IGST 1000 = 500 IGST + 500 CGST; CGST 1000 unused; SGST 1000 of 2500.
    t.equal(out.liabilityPaidInCashTotal, 1500);
    t.equal(out.creditCarriedForward, 1000);
    t.equal(out.totalCreditUsed, 2000);
  });

  test('zero credit means the whole liability is cash', function () {
    var out = R.setOff({}, { igst: 100, cgst: 200 });
    t.equal(out.liabilityPaidInCashTotal, 300);
    t.equal(out.totalCreditUsed, 0);
  });

  test('fractional amounts stay exact in paise', function () {
    var out = R.setOff({ igst: 0.1, cgst: 0.2 }, { cgst: 0.3 });
    t.equal(out.liabilityPaidInCashTotal, 0, '₹0.10 + ₹0.20 must clear ₹0.30 exactly');
  });

  test('SGST credit is not used to pay CGST, so the cash figure stays honest', function () {
    var out = R.setOff({ cgst: 0.1, sgst: 0.2 }, { cgst: 0.3 });
    t.equal(out.liabilityPaidInCashTotal, 0.2);
    t.equal(out.creditCarriedForward, 0.2);
  });
});

suite('GST recon · CSV export', function () {
  var result = R.reconcile(R.parseTable(BOOKS_CSV), R.parseTable(TWO_B_CSV));
  var csv = R.toCsv(result);

  test('the export has a header and a row per bucket entry', function () {
    var lines = csv.split('\n');
    var expected = 1 + result.matched.length + result.valueMismatch.length +
      result.taxMismatch.length + result.onlyInBooks.length + result.onlyIn2B.length;
    t.equal(lines[0].indexOf('Bucket') === 0, true);
    t.equal(lines.length, expected);
  });

  test('every bucket name appears', function () {
    ['Matched', 'Value mismatch', 'Only in books', 'Only in 2B'].forEach(function (bucket) {
      t.ok(csv.indexOf(bucket) !== -1, bucket);
    });
  });

  test('an at-risk row is labelled in plain language', function () {
    t.ok(csv.indexOf('ITC at risk') !== -1);
  });

  test('values are written in rupees with two decimals', function () {
    t.ok(csv.indexOf('100000.00') !== -1, 'taxable value of the first matched row');
  });

  test('commas inside a field are quoted', function () {
    var res = R.reconcile(R.parseTable('GSTIN,Invoice Number,Taxable Value,Supplier Name\n27AAPFU0939F1ZV,INV1,1000,"Rao, Sons"'), []);
    t.ok(R.toCsv(res).indexOf('"Rao, Sons"') !== -1);
  });
});
