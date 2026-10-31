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

  var backend = getBackend();

  function isPersistent() {
    return !!backend;
  }

  function readRaw(key) {
    if (backend) {
      try { return backend.getItem(key); } catch (e) { return null; }
    }
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
  }

  function writeRaw(key, value) {
    if (backend) {
      try {
        backend.setItem(key, value);
        return true;
      } catch (e) {
        // QuotaExceededError – report it rather than silently losing data.
        return false;
      }
    }
    memory[key] = value;
    return true;
  }

  function removeRaw(key) {
    if (backend) {
      try { backend.removeItem(key); return true; } catch (e) { return false; }
    }
    delete memory[key];
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
