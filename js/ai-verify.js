/* ===================================================
   TaxMitra – AI answer verification
   Pure functions only: no DOM, no storage, no network.

   An AI answer can be fluent and wrong. This module pulls the rupee
   figures out of an answer, recomputes the ones it can define precisely
   with the deterministic engine in js/income-tax.js, and reports one of:

     verified  – the answer's figure equals the engine's figure
     differs   – the answer's figure disagrees with the engine
     unchecked – no income was stated, so nothing can be recomputed

   It never "fixes" the answer silently: a disagreement is shown to the
   reader with the engine's number next to it.
   =================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./income-tax.js'), require('./itr-schema.js'));
  } else {
    root.TMVerify = factory(root.TMIT, root.TMITRSchema);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TMIT, TMITRSchema) {
  'use strict';

  // Rupee tolerance: a rounded answer ("about ₹1.2 lakh") is not a lie.
  var TOLERANCE = 100;

  var TAX_WORDS = /(total tax|tax payable|tax liability|income tax|tax outgo|tax due|कुल कर|टैक्स|कर देय)/i;

  /* ------------------------- number parsing ------------------------- */

  function toNumber(text) {
    var digits = String(text || '').replace(/[^0-9.]/g, '');
    if (!digits) return null;
    var n = Number(digits);
    return isFinite(n) ? n : null;
  }

  /**
   * Parse the income a question is about: "12 lakh", "1.5 crore",
   * "₹12,00,000", "1200000", "15L".
   */
  function parseIncome(text) {
    var source = String(text || '');
    var units = [[/(\d+(?:\.\d+)?)\s*(?:crore|cr)\b/i, 10000000], [/(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|l)\b/i, 100000]];
    for (var i = 0; i < units.length; i++) {
      var match = units[i][0].exec(source);
      if (match) return Math.round(Number(match[1]) * units[i][1]);
    }
    var rupee = /₹\s*([\d,]{4,})/.exec(source);
    if (rupee) return toNumber(rupee[1]);
    var bare = /\b(\d{5,9})\b/.exec(source.replace(/[,\u20b9]/g, ''));
    if (bare) return toNumber(bare[1]);
    return null;
  }

  /**
   * Every rupee figure in the text, each with the words that introduce it.
   * Labels normally come *before* the number ("total tax ₹X"), so only the
   * preceding text is used — otherwise one figure's label leaks onto the next.
   */
  function extractFigures(text) {
    var source = String(text || '');
    var figures = [];
    var regex = /₹\s*([\d,]+(?:\.\d+)?)/g;
    var match;
    while ((match = regex.exec(source)) !== null) {
      var value = toNumber(match[1]);
      if (value === null) continue;
      var start = Math.max(0, match.index - 60);
      figures.push({
        value: value,
        raw: match[0],
        context: source.slice(start, match.index),
        index: match.index
      });
    }
    return figures;
  }

  function isTaxFigure(figure) {
    return TAX_WORDS.test(figure.context) || /cess|surcharge|rebate|after.{0,12}rebate|liability/i.test(figure.context);
  }

  /* ------------------------- engine recomputation ------------------------- */

  /**
   * Tax on a stated income under one regime, computed by the engine.
   * The stated amount is treated as total income (not salary), so no
   * standard deduction is invented for it.
   */
  function computeOnIncome(income, options) {
    var opts = options || {};
    var fy = opts.fy || (TMIT.currentFinancialYear ? TMIT.currentFinancialYear() : undefined);
    var regime = opts.regime === 'old' ? 'old' : 'new';
    var age = Number(opts.age) || 30;
    var input = {
      fy: fy,
      age: age,
      residentialStatus: opts.residentialStatus || 'resident',
      regime: regime,
      grossSalary: 0,
      otherIncome: income,
      tdsPaid: 0,
      advanceTaxPaid: 0
    };
    var result = TMIT.computeTax(input);
    return {
      regime: regime,
      fy: result.fy,
      assessmentYear: result.assessmentYear,
      totalIncome: result.totalIncome,
      taxBeforeRebate: result.taxBeforeRebate,
      rebate87A: result.rebate87A,
      surcharge: result.surcharge,
      cess: result.cess,
      totalTax: result.totalTax,
      effectiveRate: result.effectiveRate
    };
  }

  /* ------------------------- verification ------------------------- */

  /**
   * verify(input) → {
   *   status: 'verified' | 'differs' | 'unchecked',
   *   income, claimed, computed, delta, regime, tolerance, message, figures
   * }
   *
   * input: { answer, question, fy, regime, age }
   */
  function verify(input) {
    var data = input || {};
    var answer = String(data.answer || '');
    var question = String(data.question || '');
    var figures = extractFigures(answer);

    // Only the question (or an explicit income) defines what is being computed —
    // a deduction figure inside the answer must never be mistaken for income.
    var income = data.income != null ? Number(data.income) : parseIncome(question);
    if (!income || income <= 0) {
      return {
        status: 'unchecked',
        reason: 'no_income',
        income: null,
        figures: figures,
        message: 'No income was stated, so the figures could not be recomputed.'
      };
    }

    var computed = computeOnIncome(income, data);
    var taxFigures = figures.filter(isTaxFigure);

    if (!taxFigures.length) {
      return {
        status: 'unchecked',
        reason: 'no_tax_figure',
        income: income,
        computed: computed,
        figures: figures,
        message: 'The answer states no tax figure to check (income ₹' + income.toLocaleString('en-IN') + ').'
      };
    }

    // Prefer the figure that looks like the final liability.
    var claimed = taxFigures.filter(function (f) { return /total tax|tax payable|tax liability|tax due|कुल कर|कर देय/i.test(f.context); })[0] || taxFigures[0];
    var delta = Math.round((claimed.value - computed.totalTax) * 100) / 100;
    var matches = Math.abs(delta) <= TOLERANCE;

    return {
      status: matches ? 'verified' : 'differs',
      reason: matches ? 'match' : 'mismatch',
      income: income,
      claimed: claimed.value,
      computed: computed,
      delta: delta,
      regime: computed.regime,
      fy: computed.fy,
      tolerance: TOLERANCE,
      figures: figures,
      message: matches
        ? 'Verified against the TaxMitra engine: ₹' + computed.totalTax.toLocaleString('en-IN') + ' tax on ₹' + income.toLocaleString('en-IN') + '.'
        : 'The answer says ₹' + claimed.value.toLocaleString('en-IN') + ' but the engine computes ₹' +
          computed.totalTax.toLocaleString('en-IN') + ' on ₹' + income.toLocaleString('en-IN') +
          ' (' + computed.regime + ' regime, ' + computed.fy + ').'
    };
  }

  /** Compact label for a chat bubble. */
  function badge(result) {
    if (!result) return '';
    if (result.status === 'verified') {
      return '<span class="tm-verify ok">✅ Engine-verified</span>';
    }
    if (result.status === 'differs') {
      return '<span class="tm-verify bad">⚠️ Engine disagrees</span>';
    }
    return '<span class="tm-verify neutral">• Not machine-checked</span>';
  }

  /** Full sentence for a details panel. */
  function explain(result) {
    if (!result) return '';
    if (result.status === 'unchecked') return result.message;
    return result.message;
  }

  return {
    TOLERANCE: TOLERANCE,
    toNumber: toNumber,
    parseIncome: parseIncome,
    extractFigures: extractFigures,
    isTaxFigure: isTaxFigure,
    computeOnIncome: computeOnIncome,
    verify: verify,
    badge: badge,
    explain: explain
  };
});
