/* ===================================================
   TaxMitra – Browser-local storage layer
   A thin, defensive wrapper over localStorage shared by
   billing, admin and any other local-first module.
   Data NEVER leaves the browser.
   =================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TMStore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PREFIX = 'tm-';

  var KEYS = {
    settings: PREFIX + 'billing-settings',
    customers: PREFIX + 'billing-customers',
    items: PREFIX + 'billing-items',
    invoices: PREFIX + 'billing-invoices',
    counter: PREFIX + 'billing-counter',
    itrDraft: PREFIX + 'itr-draft'
  };

  // Fallback used when localStorage is unavailable (private mode, tests).
  var memory = {};

  /* -------------------------------------------------
     Namespacing
     Signed-out visitors use the bare tm-* keys (unchanged, so existing
     books keep working). A signed-in GitHub account gets its own prefix,
     tm-gh-<login>-*, so two people on one browser never see each other's
     invoices. Switching accounts switches datasets; nothing is merged.
     ------------------------------------------------- */
  var namespace = '';

  function setNamespace(ns) {
    namespace = String(ns || '').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
    return namespace;
  }

  function getNamespace() {
    return namespace;
  }

  /** Translate a logical storage key into the active namespace. */
  function nsKey(key) {
    var base = String(key);
    if (!namespace) return base;
    if (base.indexOf(PREFIX) === 0) return PREFIX + namespace + '-' + base.slice(PREFIX.length);
    return namespace + '-' + base;
  }

  /** Known local profiles (e.g. gh-abhishekagrahari307-max) with their size. */
  function listNamespaces() {
    var found = {};
    var backend = backendNow();
    if (!backend) return [];
    // Match against the known store suffixes so "gh-a-b" is not mistaken for
    // namespace "a" with a store called "b-<something>".
    var suffixes = Object.keys(KEYS).map(function (name) { return KEYS[name].slice(PREFIX.length); });
    for (var i = 0; i < backend.length; i++) {
      var key = backend.key(i);
      if (!key || key.indexOf(PREFIX) !== 0) continue;
      var rest = key.slice(PREFIX.length);
      for (var j = 0; j < suffixes.length; j++) {
        var suffix = suffixes[j];
        if (rest.length > suffix.length + 1 && rest.slice(-(suffix.length + 1)) === '-' + suffix) {
          var ns = rest.slice(0, rest.length - suffix.length - 1);
          if (ns) found[ns] = (found[ns] || 0) + key.length * 2;
          break;
        }
      }
    }
    return Object.keys(found).sort().map(function (name) {
      return { namespace: name, bytes: found[name] };
    });
  }

  /** Copy every known store from one namespace into another (legacy migration). */
  function migrateNamespace(from, to) {
    var previous = namespace;
    var copied = [];
    Object.keys(KEYS).forEach(function (name) {
      setNamespace(from);
      var value = read(KEYS[name], null);
      if (value === null || value === undefined) return;
      setNamespace(to);
      var existing = read(KEYS[name], null);
      if (existing !== null && existing !== undefined) return; // never overwrite
      if (write(KEYS[name], value)) copied.push(name);
    });
    setNamespace(previous);
    return copied;
  }

  function getBackend() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        var probe = PREFIX + 'probe';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        return localStorage;
      }
    } catch (e) { /* fall through to memory */ }
    return null;
  }

  /* Resolved on demand so a browser that swaps localStorage (or a test that
     installs a mock) is always honoured, and so switching accounts never
     operates on a stale backend. */
  var backendCache = getBackend();
  var lastSeen = null;

  function backendNow() {
    var current = null;
    try {
      if (typeof localStorage !== 'undefined') current = localStorage || null;
    } catch (e) { current = null; }

    // Only re-probe when the storage object itself has been swapped, so a
    // single failing write (quota) is still reported to the caller.
    if (current !== lastSeen) {
      lastSeen = current;
      var probed = getBackend();
      if (probed !== backendCache) {
        backendCache = probed;
        if (!probed) memory = {};
      }
    }
    return backendCache;
  }

  function isPersistent() {
    return !!backendNow();
  }

  function readRaw(key) {
    var k = nsKey(key);
    var backend = backendNow();
    if (backend) {
      try { return backend.getItem(k); } catch (e) { return null; }
    }
    return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null;
  }

  function writeRaw(key, value) {
    var k = nsKey(key);
    var backend = backendNow();
    if (backend) {
      try {
        backend.setItem(k, value);
        return true;
      } catch (e) {
        // QuotaExceededError – report it rather than silently losing data.
        return false;
      }
    }
    memory[k] = value;
    return true;
  }

  function removeRaw(key) {
    var k = nsKey(key);
    var backend = backendNow();
    if (backend) {
      try { backend.removeItem(k); return true; } catch (e) { return false; }
    }
    delete memory[k];
    return true;
  }

  function read(key, fallback) {
    var raw = readRaw(key);
    if (raw === null || raw === undefined || raw === '') return fallback;
    try {
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      return writeRaw(key, JSON.stringify(value));
    } catch (e) {
      return false;
    }
  }

  function remove(key) {
    return removeRaw(key);
  }

  function uid(prefix) {
    var stamp = Date.now().toString(36);
    var rand = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '_' + stamp + rand;
  }

  /* ---------------- domain helpers ---------------- */

  var DEFAULT_SETTINGS = {
    businessName: '',
    gstin: '',
    pan: '',
    address: '',
    state: '27',
    phone: '',
    email: '',
    invoicePrefix: 'INV/',
    nextNumber: 1,
    bankName: '',
    bankAccount: '',
    bankIfsc: '',
    terms: 'Goods once sold will not be taken back. Payment due within 15 days.',
    priceIncludesTax: false
  };

  function getSettings() {
    var stored = read(KEYS.settings, {});
    var merged = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
      merged[k] = Object.prototype.hasOwnProperty.call(stored || {}, k) ? stored[k] : DEFAULT_SETTINGS[k];
    });
    return merged;
  }

  function saveSettings(settings) {
    return write(KEYS.settings, settings || {});
  }

  function list(collection) {
    var rows = read(KEYS[collection], []);
    return Array.isArray(rows) ? rows : [];
  }

  function saveList(collection, rows) {
    return write(KEYS[collection], Array.isArray(rows) ? rows : []);
  }

  /** Rough size of everything TaxMitra has stored, in bytes. */
  function sizeBreakdown() {
    var out = {};
    Object.keys(KEYS).forEach(function (name) {
      var raw = readRaw(KEYS[name]);
      out[name] = raw ? raw.length * 2 : 0; // UTF-16 code units
    });
    return out;
  }

  function totalSize() {
    var sizes = sizeBreakdown();
    return Object.keys(sizes).reduce(function (sum, k) { return sum + sizes[k]; }, 0);
  }

  /** Full JSON backup payload. */
  function exportAll() {
    var payload = {
      app: 'TaxMitra',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {}
    };
    Object.keys(KEYS).forEach(function (name) {
      payload.data[name] = read(KEYS[name], null);
    });
    return payload;
  }

  /**
   * Restore a backup produced by exportAll().
   * Returns { ok, imported[], skipped[], error }.
   */
  function importAll(payload) {
    if (!payload || typeof payload !== 'object' || !payload.data) {
      return { ok: false, imported: [], skipped: [], error: 'Not a TaxMitra backup file (missing "data")' };
    }
    var imported = [];
    var skipped = [];
    Object.keys(KEYS).forEach(function (name) {
      if (!Object.prototype.hasOwnProperty.call(payload.data, name)) {
        skipped.push(name);
        return;
      }
      var value = payload.data[name];
      if (value === null || value === undefined) { skipped.push(name); return; }
      if (write(KEYS[name], value)) imported.push(name);
      else skipped.push(name);
    });
    return { ok: imported.length > 0, imported: imported, skipped: skipped, error: imported.length ? null : 'Nothing could be written' };
  }

  function clearAll() {
    Object.keys(KEYS).forEach(function (name) { removeRaw(KEYS[name]); });
    return true;
  }

  function nextInvoiceNumber(prefix, padding) {
    var counter = read(KEYS.counter, { value: 0 });
    var n = Number(counter && counter.value) || 0;
    n += 1;
    write(KEYS.counter, { value: n, updatedAt: new Date().toISOString() });
    var pad = padding === undefined ? 4 : padding;
    var str = String(n);
    while (str.length < pad) str = '0' + str;
    return String(prefix || 'INV/') + str;
  }

  function peekInvoiceCounter() {
    var counter = read(KEYS.counter, { value: 0 });
    return Number(counter && counter.value) || 0;
  }

  return {
    KEYS: KEYS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    setNamespace: setNamespace,
    getNamespace: getNamespace,
    nsKey: nsKey,
    listNamespaces: listNamespaces,
    migrateNamespace: migrateNamespace,
    isPersistent: isPersistent,
    read: read,
    write: write,
    remove: remove,
    uid: uid,
    getSettings: getSettings,
    saveSettings: saveSettings,
    list: list,
    saveList: saveList,
    sizeBreakdown: sizeBreakdown,
    totalSize: totalSize,
    exportAll: exportAll,
    importAll: importAll,
    clearAll: clearAll,
    nextInvoiceNumber: nextInvoiceNumber,
    peekInvoiceCounter: peekInvoiceCounter
  };
});
