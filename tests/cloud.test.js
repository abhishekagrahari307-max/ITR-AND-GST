'use strict';

/* Unit tests for the browser cloud client (js/cloud.js).
   The HTTP layer is exercised in server/test/server.test.js; here we cover the
   pure decisions: what to push, what to pull, and when to refuse to guess. */

var t = require('./harness');
var path = require('path');

function makeStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
    clear: function () { data = {}; },
    key: function (i) { return Object.keys(data)[i] || null; },
    get length() { return Object.keys(data).length; }
  };
}

global.localStorage = makeStorage();
var C = require(path.join(__dirname, '..', 'js', 'cloud.js'));

var suite = t.suite;
var test = t.test;
var plan = C._internals.planSync;
var hash = C._internals.hashString;

function localDoc(overrides) {
  return Object.assign({ value: { a: 1 }, hash: 'h1', bytes: 10 }, overrides || {});
}

function cloudDoc(overrides) {
  return Object.assign({ value: { a: 1 }, updatedAt: 1000, version: 1, hash: 'h1' }, overrides || {});
}

suite('Cloud · hashing', function () {
  test('the same value always hashes to the same string', function () {
    t.equal(hash('{"a":1}'), hash('{"a":1}'));
  });

  test('different values hash differently', function () {
    t.ok(hash('{"a":1}') !== hash('{"a":2}'));
  });

  test('the hash is short and stable in shape', function () {
    t.equal(hash('x').length, 8);
    t.equal(hash(''), '811c9dc5');
  });
});

suite('Cloud · first contact between a device and an account', function () {
  test('two non-empty sides ask the user instead of guessing', function () {
    var result = plan({ 'tm-a': localDoc() }, { 'tm-a': cloudDoc() }, { hashes: {}, ts: {} });
    t.ok(result.needsDecision, 'must require an explicit choice');
    t.equal(result.localCount, 1);
    t.equal(result.cloudCount, 1);
  });

  test('a device with data and an empty account pushes everything', function () {
    var result = plan({ 'tm-a': localDoc(), 'tm-b': localDoc() }, {}, { hashes: {}, ts: {} });
    t.equal(result.push.length, 2);
    t.notOk(result.needsDecision);
  });

  test('an account with data and an empty device pulls everything', function () {
    var result = plan({}, { 'tm-a': cloudDoc(), 'tm-b': cloudDoc() }, { hashes: {}, ts: {} });
    t.equal(result.pull.length, 2);
  });

  test('an explicit "keep this device" decision pushes the local copy', function () {
    var result = plan({ 'tm-a': localDoc() }, { 'tm-a': cloudDoc() }, { hashes: {}, ts: {} }, 'local');
    t.equal(result.push.length, 1);
    t.equal(result.pull.length, 0);
  });

  test('an explicit "keep the cloud" decision pulls the cloud copy', function () {
    var result = plan({ 'tm-a': localDoc() }, { 'tm-a': cloudDoc() }, { hashes: {}, ts: {} }, 'cloud');
    t.equal(result.pull.length, 1);
    t.equal(result.push.length, 0);
  });
});

suite('Cloud · steady-state merge', function () {
  test('a local edit alone is pushed', function () {
    var meta = { hashes: { 'tm-a': 'old' }, ts: { 'tm-a': 1000 }, syncedAt: 1000 };
    var result = plan({ 'tm-a': localDoc({ hash: 'new' }) }, { 'tm-a': cloudDoc() }, meta);
    t.equal(result.push.length, 1);
    t.equal(result.pull.length, 0);
  });

  test('a cloud edit alone is pulled', function () {
    var meta = { hashes: { 'tm-a': 'h1' }, ts: { 'tm-a': 1000 }, syncedAt: 1000 };
    var result = plan({ 'tm-a': localDoc() }, { 'tm-a': cloudDoc({ updatedAt: 2000 }) }, meta);
    t.equal(result.pull.length, 1);
    t.equal(result.push.length, 0);
  });

  test('an unchanged document is neither pushed nor pulled', function () {
    var meta = { hashes: { 'tm-a': 'h1' }, ts: { 'tm-a': 2000 }, syncedAt: 2000 };
    var result = plan({ 'tm-a': localDoc() }, { 'tm-a': cloudDoc({ updatedAt: 2000 }) }, meta);
    t.equal(result.push.length, 0);
    t.equal(result.pull.length, 0);
  });

  test('a real conflict resolves to the newer side and is reported', function () {
    var meta = { hashes: { 'tm-a': 'old' }, ts: { 'tm-a': 1000 }, localTs: { 'tm-a': 5000 }, syncedAt: 1000 };
    var deviceWins = plan({ 'tm-a': localDoc({ hash: 'new' }) }, { 'tm-a': cloudDoc({ updatedAt: 3000 }) }, meta);
    t.equal(deviceWins.push.length, 1);
    t.equal(deviceWins.conflicts[0].winner, 'device');

    var meta2 = { hashes: { 'tm-a': 'old' }, ts: { 'tm-a': 1000 }, localTs: { 'tm-a': 1500 }, syncedAt: 1000 };
    var cloudWins = plan({ 'tm-a': localDoc({ hash: 'new' }) }, { 'tm-a': cloudDoc({ updatedAt: 3000 }) }, meta2);
    t.equal(cloudWins.pull.length, 1);
    t.equal(cloudWins.conflicts[0].winner, 'cloud');
  });

  test('a document that exists only in the cloud is pulled', function () {
    var meta = { hashes: {}, ts: {}, syncedAt: 1 };
    var result = plan({}, { 'tm-only-cloud': cloudDoc() }, meta);
    t.equal(result.pull.length, 1);
  });
});

suite('Cloud · snapshot and api base', function () {
  test('the snapshot ignores credentials and visitor AI keys', function () {
    global.localStorage.clear();
    global.localStorage.setItem('tm_keys', '{"geminiApiKey":"secret"}');
    global.localStorage.setItem('tm_cloud_token', 'token');
    global.localStorage.setItem('tm-billing-invoices', '[{"id":1}]');
    global.localStorage.setItem('itr_draft_1', '{"income":100}');
    global.localStorage.setItem('unrelated', 'nope');
    var snap = C.localSnapshot();
    t.equal(Object.keys(snap).length, 2);
    t.ok(snap['tm-billing-invoices']);
    t.ok(snap['itr_draft_1']);
    t.notOk(snap.tm_keys);
    t.notOk(snap.tm_cloud_token);
  });

  test('the API base defaults to /api and honours an override', function () {
    t.equal(C._internals.apiBase(), '/api');
  });
});

suite('Cloud · AI proxy mapping', function () {
  var toMessages = C._internals.geminiToMessages;

  test('Gemini contents become chat messages, with model → assistant', function () {
    var messages = toMessages({
      contents: [
        { role: 'user', parts: [{ text: '80C limit?' }] },
        { role: 'model', parts: [{ text: '1.5 lakh' }] },
        { role: 'user', parts: [{ text: 'Aur 80D?' }] }
      ]
    });
    t.equal(messages.length, 3);
    t.equal(messages[0].role, 'user');
    t.equal(messages[1].role, 'assistant');
    t.equal(messages[2].content, 'Aur 80D?');
  });

  test('empty or malformed contents produce no messages', function () {
    t.equal(toMessages({ contents: [] }).length, 0);
    t.equal(toMessages({}).length, 0);
    t.equal(toMessages({ contents: [{ role: 'user', parts: [{ text: '   ' }] }] }).length, 0);
  });

  test('multiple text parts are joined', function () {
    var messages = toMessages({ contents: [{ role: 'user', parts: [{ text: 'Hello ' }, { text: 'world' }] }] });
    t.equal(messages[0].content, 'Hello world');
  });
});
