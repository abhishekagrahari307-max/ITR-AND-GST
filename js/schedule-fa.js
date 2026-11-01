/* ===================================================
   TaxMitra – Schedule FA (foreign assets) helper
   Pure functions only: no DOM, no storage, no network.

   Schedule FA asks for every foreign asset held at any time during the
   year, with the peak and closing balance *in rupees*. Rule 115 fixes the
   conversion rate as the SBI telegraphic-transfer **buying** rate on the
   last day of the previous year (31 March). This module does the
   arithmetic and the disclosure checklist; the taxpayer supplies the
   rate, because a static site cannot fetch a live SBI quote (and must
   not pretend to).
   =================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./itr-schema.js'));
  } else {
    root.TMScheduleFA = factory(root.TMITRSchema);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TMITRSchema) {
  'use strict';

  var TYPES = {
    bank: { label: 'Foreign bank account', schedule: 'A1', hint: 'Balance in the account at any time during the year.' },
    equity: { label: 'Foreign equity / ETF', schedule: 'A2', hint: 'Shares held directly with a foreign broker.' },
    rsu: { label: 'RSU (vested shares)', schedule: 'A2', hint: 'Vested restricted stock units held in a foreign account.' },
    espp: { label: 'ESPP shares', schedule: 'A2', hint: 'Shares bought under an employee stock purchase plan.' },
    custody: { label: 'Foreign custodial account', schedule: 'A1', hint: 'Brokerage or custody account that holds securities.' },
    other: { label: 'Other foreign asset', schedule: 'A3', hint: 'Property, trust interest, insurance, virtual assets, etc.' }
  };

  var CURRENCIES = ['USD', 'EUR', 'GBP', 'SGD', 'AED', 'CAD', 'AUD', 'JPY', 'CHF', 'HKD', 'OTHER'];

  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function round2(value) {
    return Math.round((num(value) + Number.EPSILON) * 100) / 100;
  }

  function upper(value) {
    return String(value == null ? '' : value).toUpperCase().replace(/\s+/g, '');
  }

  function emptyEntry() {
    return {
      id: '',
      type: 'bank',
      country: '',
      countryCode: '',
      entity: '',
      accountNumber: '',
      address: '',
      currency: 'USD',
      rate: 0,
      acquired: '',
      initialForeign: 0,
      peakForeign: 0,
      closingForeign: 0,
      initialValue: 0,
      peakValue: 0,
      closingValue: 0,
      incomeIncluded: false,
      notes: ''
    };
  }

  /**
   * Fill in the rupee values.
   * When a foreign-currency amount and a rule-115 rate are given, the rupee
   * value is computed from them; otherwise the rupee figure entered directly
   * is used. The conversion is always shown back to the taxpayer.
   */
  function normalise(entry) {
    var row = emptyEntry();
    var source = entry || {};
    Object.keys(row).forEach(function (key) {
      if (source[key] !== undefined && source[key] !== null) row[key] = source[key];
    });
    row.type = TYPES[row.type] ? row.type : 'other';
    row.country = String(row.country || '').trim();
    row.countryCode = upper(row.countryCode).slice(0, 2);
    row.entity = String(row.entity || '').trim();
    row.accountNumber = String(row.accountNumber || '').trim();
    row.currency = upper(row.currency) || 'USD';
    row.rate = num(row.rate);

    ['initialForeign', 'peakForeign', 'closingForeign', 'initialValue', 'peakValue', 'closingValue'].forEach(function (key) {
      row[key] = round2(row[key]);
    });

    row.converted = { initial: false, peak: false, closing: false };
    ['initial', 'peak', 'closing'].forEach(function (phase) {
      var foreign = row[phase + 'Foreign'];
      if (row.rate > 0 && foreign > 0) {
        row[phase + 'Value'] = round2(foreign * row.rate);
        row.converted[phase] = true;
      }
    });

    row.peakValue = Math.max(row.peakValue, row.closingValue, row.initialValue);
    row.schedule = (TYPES[row.type] || TYPES.other).schedule;
    return row;
  }

  function totals(entries) {
    var rows = (entries || []).map(normalise);
    var peak = 0, closing = 0, initial = 0;
    var byCountry = {};
    rows.forEach(function (row) {
      peak += row.peakValue;
      closing += row.closingValue;
      initial += row.initialValue;
      var key = row.countryCode || row.country || 'Unspecified';
      if (!byCountry[key]) byCountry[key] = { country: row.country || key, count: 0, peak: 0, closing: 0 };
      byCountry[key].count += 1;
      byCountry[key].peak = round2(byCountry[key].peak + row.peakValue);
      byCountry[key].closing = round2(byCountry[key].closing + row.closingValue);
    });
    return {
      count: rows.length,
      initial: round2(initial),
      peak: round2(peak),
      closing: round2(closing),
      byCountry: Object.keys(byCountry).sort().map(function (key) { return byCountry[key]; }),
      rows: rows
    };
  }

  /** The wizard-shaped state fragment that the schema validator understands. */
  function toState(entries, profile) {
    var p = profile || {};
    return {
      profile: {
        fy: p.fy || '2025-26',
        entityType: p.entityType || 'individual',
        name: p.name || '',
        pan: p.pan || '',
        age: p.age == null ? 30 : p.age,
        residentialStatus: p.residentialStatus || 'resident',
        foreignAssets: (entries || []).length > 0
      },
      fa: {
        rateSource: p.rateSource || 'SBI TT buying rate on 31 March (rule 115)',
        entries: (entries || []).map(normalise)
      }
    };
  }

  /** Reuse the ITR validator so both pages agree on what "valid" means. */
  function validate(entries, profile) {
    if (!TMITRSchema || typeof TMITRSchema.validate !== 'function') {
      return { ok: true, errors: [], warnings: [], unavailable: true };
    }
    var result = TMITRSchema.validate(toState(entries, profile));
    // Keep only the Schedule FA findings; the other sections belong to the wizard.
    return {
      ok: result.ok || result.errors.every(function (e) { return e.section !== 'ScheduleFA' && e.section !== 'PersonalInfo'; }),
      errors: result.errors.filter(function (e) { return e.section === 'ScheduleFA'; }),
      warnings: result.warnings.filter(function (e) { return e.section === 'ScheduleFA'; }),
      unavailable: false
    };
  }

  /** Disclosure checklist — the things people forget, not a filing instruction. */
  function checklist(entries) {
    var rows = (entries || []).map(normalise);
    var items = [];
    items.push({
      id: 'any',
      text: 'At least one foreign asset entry is present.',
      done: rows.length > 0
    });
    items.push({
      id: 'country',
      text: 'Every entry names the country of the asset.',
      done: rows.length > 0 && rows.every(function (r) { return !!r.country; })
    });
    items.push({
      id: 'entity',
      text: 'Every entry names the entity or institution holding it.',
      done: rows.length > 0 && rows.every(function (r) { return !!r.entity; })
    });
    items.push({
      id: 'peak',
      text: 'Peak balance during the year is filled in (not just the closing balance).',
      done: rows.length > 0 && rows.every(function (r) { return r.peakValue > 0; })
    });
    items.push({
      id: 'rate',
      text: 'A rule 115 conversion rate is recorded for every entry.',
      done: rows.length > 0 && rows.every(function (r) { return r.rate > 0 || r.currency === 'INR'; })
    });
    items.push({
      id: 'income',
      text: 'Income from the asset is either included in total income or explained.',
      done: rows.length > 0 && rows.every(function (r) { return r.incomeIncluded || !!String(r.notes || '').trim(); })
    });
    return {
      items: items,
      complete: items.every(function (i) { return i.done; }),
      doneCount: items.filter(function (i) { return i.done; }).length,
      total: items.length
    };
  }

  var CSV_HEADERS = ['Schedule', 'Type', 'Country', 'Country code', 'Entity', 'Account number', 'Currency',
    'Rule 115 rate', 'Acquired', 'Initial value (INR)', 'Peak value (INR)', 'Closing value (INR)',
    'Income included', 'Notes'];

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function toCsv(entries) {
    var rows = (entries || []).map(normalise);
    var lines = [CSV_HEADERS.join(',')];
    rows.forEach(function (row) {
      lines.push([
        row.schedule, (TYPES[row.type] || TYPES.other).label, row.country, row.countryCode, row.entity,
        row.accountNumber, row.currency, row.rate, row.acquired,
        row.initialValue.toFixed(2), row.peakValue.toFixed(2), row.closingValue.toFixed(2),
        row.incomeIncluded ? 'Yes' : 'No', row.notes
      ].map(csvCell).join(','));
    });
    var t = totals(rows);
    lines.push(['', 'TOTAL', '', '', '', '', '', '', '', t.initial.toFixed(2), t.peak.toFixed(2), t.closing.toFixed(2), '', ''].map(csvCell).join(','));
    return lines.join('\n');
  }

  /** The fragment stored on this browser and merged into the ITR draft. */
  function toStore(entries, profile) {
    return {
      savedAt: new Date().toISOString(),
      rateSource: (profile && profile.rateSource) || 'SBI TT buying rate on 31 March (rule 115)',
      entries: (entries || []).map(normalise)
    };
  }

  return {
    TYPES: TYPES,
    CURRENCIES: CURRENCIES,
    emptyEntry: emptyEntry,
    normalise: normalise,
    totals: totals,
    toState: toState,
    validate: validate,
    checklist: checklist,
    toCsv: toCsv,
    toStore: toStore
  };
});
