'use strict';

var t = require('./harness');
var path = require('path');

var F = require(path.join(__dirname, '..', 'js', 'schedule-fa.js'));
var S = require(path.join(__dirname, '..', 'js', 'itr-schema.js'));
var suite = t.suite;
var test = t.test;

function rsu() {
  return F.normalise({
    id: 'fa-1', type: 'rsu', country: 'United States', countryCode: 'us', entity: 'Broker Inc',
    accountNumber: 'XXXX1234', currency: 'USD', rate: 83.5,
    initialForeign: 4000, peakForeign: 6200, closingForeign: 5800,
    acquired: '2023-06-15', incomeIncluded: true
  });
}

function bank() {
  return F.normalise({
    id: 'fa-2', type: 'bank', country: 'Singapore', countryCode: 'SG', entity: 'DBS Bank',
    accountNumber: '123456', currency: 'SGD', rate: 62,
    initialForeign: 0, peakForeign: 3000, closingForeign: 3000,
    notes: 'Interest offered under other income'
  });
}

suite('Schedule FA · normalising entries', function () {
  test('a foreign amount and a rule 115 rate produce the rupee figure', function () {
    var row = rsu();
    t.equal(row.initialValue, 334000);
    t.equal(row.peakValue, 517700);
    t.equal(row.closingValue, 484300);
    t.equal(row.converted.peak, true);
  });

  test('a rupee figure typed directly is used when no rate is given', function () {
    var row = F.normalise({ type: 'other', country: 'UAE', entity: 'Property', peakValue: 9000000, closingValue: 9000000 });
    t.equal(row.peakValue, 9000000);
    t.equal(row.converted.peak, false);
  });

  test('peak is never below the closing or initial value', function () {
    var row = F.normalise({ country: 'US', entity: 'X', initialValue: 500, closingValue: 900 });
    t.equal(row.peakValue, 900);
  });

  test('the country code is upper-cased and the currency defaults to USD', function () {
    var row = F.normalise({ country: 'usa', countryCode: 'us', entity: 'X', peakValue: 1 });
    t.equal(row.countryCode, 'US');
    t.equal(row.currency, 'USD');
  });

  test('an unknown asset type falls back to "other"', function () {
    t.equal(F.normalise({ type: 'crypto-moon', country: 'US', entity: 'X' }).type, 'other');
  });

  test('every type carries its schedule reference', function () {
    t.equal(F.normalise({ type: 'bank' }).schedule, 'A1');
    t.equal(F.normalise({ type: 'rsu' }).schedule, 'A2');
    t.equal(F.normalise({ type: 'other' }).schedule, 'A3');
  });

  test('junk numbers become zero rather than NaN', function () {
    var row = F.normalise({ country: 'US', entity: 'X', rate: 'abc', peakForeign: 'x', peakValue: null });
    t.equal(row.rate, 0);
    t.equal(row.peakValue, 0);
  });
});

suite('Schedule FA · totals', function () {
  var totals = F.totals([rsu(), bank()]);

  test('peak and closing values are summed across entries', function () {
    t.equal(totals.count, 2);
    t.equal(totals.peak, 703700);
    t.equal(totals.closing, 670300);
    t.equal(totals.initial, 334000);
  });

  test('totals are broken down per country', function () {
    t.equal(totals.byCountry.length, 2);
    var us = totals.byCountry.filter(function (c) { return c.countryCode === 'US' || c.country === 'United States'; })[0];
    t.equal(us.peak, 517700);
    t.equal(us.count, 1);
  });

  test('an empty schedule totals to zero', function () {
    var empty = F.totals([]);
    t.equal(empty.count, 0);
    t.equal(empty.peak, 0);
    t.equal(empty.byCountry.length, 0);
  });

  test('fractional values stay exact', function () {
    var row = F.normalise({ country: 'US', entity: 'X', currency: 'USD', rate: 83.3333, peakForeign: 3 });
    t.equal(row.peakValue, 250);
    t.equal(F.totals([row]).peak, 250);
  });
});

suite('Schedule FA · validation and checklist', function () {
  test('a complete set of entries passes the shared validator', function () {
    var result = F.validate([rsu(), bank()], { pan: 'ABCDE1234F', name: 'Asha' });
    t.equal(result.ok, true);
    t.equal(result.errors.length, 0);
  });

  test('a missing country is an error', function () {
    var result = F.validate([F.normalise({ type: 'bank', entity: 'Bank', peakValue: 1000 })]);
    t.ok(result.errors.length >= 1);
    t.ok(result.errors.some(function (e) { return /country/i.test(e.message); }));
  });

  test('a missing entity is an error', function () {
    var result = F.validate([F.normalise({ type: 'bank', country: 'UK', peakValue: 1000 })]);
    t.ok(result.errors.some(function (e) { return /entity or account/i.test(e.message); }));
  });

  test('the validator is reused from the ITR schema, not duplicated', function () {
    var result = F.validate([rsu()], {});
    t.equal(result.unavailable, false);
    t.equal(typeof S.validate, 'function', 'the schema module is the single source of truth');
  });

  test('the checklist names what is still missing', function () {
    var partial = F.checklist([F.normalise({ type: 'bank', country: 'UK', entity: 'Bank', peakValue: 1000 })]);
    t.equal(partial.complete, false);
    var failed = partial.items.filter(function (i) { return !i.done; }).map(function (i) { return i.id; });
    t.ok(failed.indexOf('rate') !== -1, 'no rule 115 rate was recorded');
    t.ok(failed.indexOf('income') !== -1, 'income treatment and notes are blank');
  });

  test('a complete schedule passes every checklist item', function () {
    var complete = F.checklist([rsu(), bank()]);
    t.equal(complete.complete, true);
    t.equal(complete.doneCount, complete.total);
  });

  test('an empty schedule is never "complete"', function () {
    var empty = F.checklist([]);
    t.equal(empty.complete, false);
    t.equal(empty.doneCount, 0);
  });
});

suite('Schedule FA · exports', function () {
  test('the CSV has a header, one row per entry and a total line', function () {
    var lines = F.toCsv([rsu(), bank()]).split('\n');
    t.equal(lines.length, 4);
    t.ok(lines[0].indexOf('Schedule') === 0);
    t.ok(lines[3].indexOf('TOTAL') !== -1);
    t.ok(lines[3].indexOf('703700.00') !== -1);
  });

  test('commas inside a field are quoted', function () {
    var row = F.normalise({ country: 'US', entity: 'Smith, Jones & Co', peakValue: 10 });
    t.ok(F.toCsv([row]).indexOf('"Smith, Jones & Co"') !== -1);
  });

  test('the stored fragment is timestamped and normalised', function () {
    var stored = F.toStore([rsu()]);
    t.ok(stored.savedAt);
    t.equal(stored.entries.length, 1);
    t.equal(stored.entries[0].peakValue, 517700);
    t.ok(stored.rateSource.indexOf('rule 115') !== -1);
  });

  test('the wizard state fragment flags foreign assets automatically', function () {
    var state = F.toState([rsu()], { fy: '2025-26', pan: 'ABCDE1234F' });
    t.equal(state.profile.foreignAssets, true);
    t.equal(state.fa.entries.length, 1);
    t.equal(F.toState([], {}).profile.foreignAssets, false);
  });

  test('the export lands inside the ITR JSON Schedule FA section', function () {
    var entries = [rsu(), bank()];
    var doc = S.build(Object.assign({}, F.toState(entries, { fy: '2025-26', pan: 'ABCDE1234F', name: 'Asha' }), {
      income: { grossSalary: 2000000 },
      taxes: { tdsPaid: 100000 }
    }));
    var payload = doc.ITR[Object.keys(doc.ITR)[0]];
    t.equal(payload.ScheduleFA.Applicable, true);
    t.equal(payload.ScheduleFA.TotalPeakValue, 703700);
    t.equal(payload.ScheduleFA.ForeignBankAccounts.length, 1);
    t.equal(payload.ScheduleFA.ForeignEquityDebt.length, 1);
    t.equal(doc.submitted, false);
  });

  test('nothing is exported as filed or verified', function () {
    var text = JSON.stringify(F.toStore([rsu()]));
    t.equal(/"submitted":\s*true/.test(text), false);
    t.equal(/"verified":\s*true/.test(text), false);
  });
});
