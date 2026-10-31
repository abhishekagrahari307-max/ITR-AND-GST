'use strict';

var t = require('./harness');
var path = require('path');

/* A minimal localStorage stand-in so the store can be exercised under Node. */
function makeStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
    clear: function () { data = {}; },
    key: function (i) { return Object.keys(data)[i] || null; },
    get length() { return Object.keys(data).length; },
    _dump: function () { return data; }
  };
}

global.localStorage = makeStorage();
var S = require(path.join(__dirname, '..', 'js', 'tm-store.js'));

var suite = t.suite;
var test = t.test;

suite('Store · basics', function () {
  test('persistent backend is detected', function () {
    t.equal(S.isPersistent(), true);
  });

  test('keys are namespaced with tm-', function () {
    Object.keys(S.KEYS).forEach(function (name) {
      t.ok(S.KEYS[name].indexOf('tm-') === 0, name + ' key should start with tm-');
    });
  });

  test('write then read round-trips objects', function () {
    S.write('tm-test', { a: 1, b: [1, 2, 3], c: 'x' });
    t.deepEqual(S.read('tm-test', null), { a: 1, b: [1, 2, 3], c: 'x' });
  });

  test('missing keys return the fallback', function () {
    t.equal(S.read('tm-missing', 'fallback'), 'fallback');
    t.deepEqual(S.read('tm-missing', []), []);
  });

  test('corrupt JSON returns the fallback instead of throwing', function () {
    localStorage.setItem('tm-corrupt', '{not json');
    t.equal(S.read('tm-corrupt', 'safe'), 'safe');
  });

  test('remove deletes a key', function () {
    S.write('tm-temp', 1);
    S.remove('tm-temp');
    t.equal(S.read('tm-temp', null), null);
  });

  test('uid is unique enough for invoice ids', function () {
    var seen = {};
    for (var i = 0; i < 500; i++) {
      var id = S.uid('inv');
      t.notOk(seen[id], 'duplicate id generated: ' + id);
      seen[id] = true;
    }
  });

  test('uid respects the prefix', function () {
    t.ok(S.uid('cus').indexOf('cus_') === 0);
    t.ok(S.uid('itm').indexOf('itm_') === 0);
  });
});

suite('Store · settings', function () {
  test('defaults are supplied when nothing is stored', function () {
    S.remove(S.KEYS.settings);
    var settings = S.getSettings();
    t.equal(settings.invoicePrefix, 'INV/');
    t.equal(settings.state, '27');
    t.equal(settings.priceIncludesTax, false);
  });

  test('saved values override defaults but keep the rest', function () {
    S.saveSettings({ businessName: 'ACME Traders', gstin: '27AAPFU0939F1ZV' });
    var settings = S.getSettings();
    t.equal(settings.businessName, 'ACME Traders');
    t.equal(settings.gstin, '27AAPFU0939F1ZV');
    t.equal(settings.invoicePrefix, 'INV/', 'unspecified keys fall back to defaults');
  });

  test('a boolean false is preserved, not overwritten by the default', function () {
    S.saveSettings({ priceIncludesTax: false });
    t.equal(S.getSettings().priceIncludesTax, false);
  });
});

suite('Store · collections', function () {
  test('empty collections read as arrays', function () {
    S.remove(S.KEYS.customers);
    t.deepEqual(S.list('customers'), []);
  });

  test('saveList and list round-trip', function () {
    var rows = [{ id: 'a' }, { id: 'b' }];
    S.saveList('items', rows);
    t.deepEqual(S.list('items'), rows);
  });

  test('a corrupt collection does not crash the app', function () {
    localStorage.setItem(S.KEYS.invoices, '"a string, not an array"');
    t.deepEqual(S.list('invoices'), [], 'non-array data should be ignored');
  });
});

suite('Store · numbering', function () {
  test('nextInvoiceNumber increments and zero-pads', function () {
    S.remove(S.KEYS.counter);
    t.equal(S.nextInvoiceNumber('INV/', 4), 'INV/0001');
    t.equal(S.nextInvoiceNumber('INV/', 4), 'INV/0002');
    t.equal(S.peekInvoiceCounter(), 2);
  });

  test('custom padding and prefix', function () {
    S.remove(S.KEYS.counter);
    t.equal(S.nextInvoiceNumber('TM-', 2), 'TM-01');
    t.equal(S.peekInvoiceCounter(), 1);
  });

  test('peek does not advance the counter', function () {
    S.remove(S.KEYS.counter);
    S.nextInvoiceNumber('X/', 4);
    var before = S.peekInvoiceCounter();
    S.peekInvoiceCounter();
    S.peekInvoiceCounter();
    t.equal(S.peekInvoiceCounter(), before);
  });
});

suite('Store · backup and restore', function () {
  test('exportAll carries app metadata and every store', function () {
    S.saveList('customers', [{ id: 'c1' }]);
    var payload = S.exportAll();
    t.equal(payload.app, 'TaxMitra');
    t.equal(payload.formatVersion, 1);
    t.ok(payload.exportedAt);
    Object.keys(S.KEYS).forEach(function (name) {
      t.ok(Object.prototype.hasOwnProperty.call(payload.data, name), name + ' should be in the backup');
    });
  });

  test('importAll restores data', function () {
    var payload = {
      app: 'TaxMitra', formatVersion: 1,
      data: { customers: [{ id: 'restored' }], invoices: [{ id: 'inv1' }] }
    };
    var result = S.importAll(payload);
    t.equal(result.ok, true);
    t.deepEqual(S.list('customers'), [{ id: 'restored' }]);
    t.deepEqual(S.list('invoices'), [{ id: 'inv1' }]);
  });

  test('importAll rejects non-backup payloads', function () {
    t.equal(S.importAll(null).ok, false);
    t.equal(S.importAll({}).ok, false, 'missing data key');
    t.equal(S.importAll('nope').ok, false);
    t.includes(S.importAll({}).error, 'Not a TaxMitra backup');
  });

  test('importAll reports skipped stores', function () {
    var result = S.importAll({ data: { customers: [{ id: 'x' }] } });
    t.ok(result.skipped.length > 0);
    t.equal(result.ok, true);
  });
});

suite('Store · diagnostics', function () {
  test('sizeBreakdown reports a number for every store', function () {
    var sizes = S.sizeBreakdown();
    Object.keys(S.KEYS).forEach(function (name) {
      t.equal(typeof sizes[name], 'number');
      t.ok(sizes[name] >= 0);
    });
  });

  test('totalSize is the sum of the parts', function () {
    var sizes = S.sizeBreakdown();
    var sum = Object.keys(sizes).reduce(function (acc, k) { return acc + sizes[k]; }, 0);
    t.equal(S.totalSize(), sum);
  });

  test('clearAll empties every store', function () {
    S.saveList('customers', [{ id: 'x' }]);
    S.clearAll();
    Object.keys(S.KEYS).forEach(function (name) {
      t.equal(S.read(S.KEYS[name], null), null, name + ' should be cleared');
    });
    t.deepEqual(S.list('customers'), []);
  });
});

suite('Store · quotas and failure paths', function () {
  test('a failing setItem is reported instead of throwing', function () {
    var original = localStorage.setItem;
    localStorage.setItem = function () { throw new Error('QuotaExceededError'); };
    t.equal(S.write('tm-quota', { big: true }), false);
    localStorage.setItem = original;
  });
});
