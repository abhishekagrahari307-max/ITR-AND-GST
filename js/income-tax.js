/* ===================================================
   TaxMitra – Income Tax Engine
   Pure functions only: no DOM, no storage, no network.
   Works in the browser (window.TMIT) and in Node (require).

   Covers FY 2024-25, 2025-26 and 2026-27 (AY 2027-28).
   Budget 2026 left both regimes' slabs unchanged, so
   2025-26 and 2026-27 share the same slab tables.

   IMPORTANT LIMITS (documented, not hidden):
   * Individual / HUF taxpayers only (no firm / company rates).
   * Chapter VI-A and salary exemptions are modelled at the
     schedule level; complex cases (80G approval limits,
     clubbing, foreign tax credit) need manual review.
   * Figures are an estimate for planning and ITR preparation
     – not a substitute for the utility's own computation.
   =================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TMIT = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CESS_RATE = 0.04;

  /* -------------------------------------------------
     Slab tables
     ------------------------------------------------- */
  // New regime (section 115BAC) – default regime
  var NEW_SLABS_2024_25 = [
    { upTo: 300000, rate: 0 }, { upTo: 700000, rate: 5 }, { upTo: 1000000, rate: 10 },
    { upTo: 1200000, rate: 15 }, { upTo: 1500000, rate: 20 }, { upTo: Infinity, rate: 30 }
  ];
  var NEW_SLABS_2025_26 = [
    { upTo: 400000, rate: 0 }, { upTo: 800000, rate: 5 }, { upTo: 1200000, rate: 10 },
    { upTo: 1600000, rate: 15 }, { upTo: 2000000, rate: 20 }, { upTo: 2400000, rate: 25 },
    { upTo: Infinity, rate: 30 }
  ];
  var OLD_SLABS = {
    below60: [{ upTo: 250000, rate: 0 }, { upTo: 500000, rate: 5 }, { upTo: 1000000, rate: 20 }, { upTo: Infinity, rate: 30 }],
    senior: [{ upTo: 300000, rate: 0 }, { upTo: 500000, rate: 5 }, { upTo: 1000000, rate: 20 }, { upTo: Infinity, rate: 30 }],
    superSenior: [{ upTo: 500000, rate: 0 }, { upTo: 1000000, rate: 20 }, { upTo: Infinity, rate: 30 }]
  };

  var FINANCIAL_YEARS = {
    '2024-25': {
      assessmentYear: '2025-26',
      newRegime: { slabs: NEW_SLABS_2024_25, standardDeduction: 75000, rebate: { threshold: 700000, max: 25000, marginalRelief: true } },
      oldRegime: { slabs: OLD_SLABS, standardDeduction: 50000, rebate: { threshold: 500000, max: 12500, marginalRelief: false } },
      // Capital gains rates changed w.e.f. 23 July 2024; FY 2024-25 uses the new rates
      // for transfers on/after that date – we use the post-July rates as the default.
      capitalGains: { stcg111a: 20, ltcg112a: 12.5, ltcg112aExemption: 125000, ltcg112: 12.5 }
    },
    '2025-26': {
      assessmentYear: '2026-27',
      newRegime: { slabs: NEW_SLABS_2025_26, standardDeduction: 75000, rebate: { threshold: 1200000, max: 60000, marginalRelief: true } },
      oldRegime: { slabs: OLD_SLABS, standardDeduction: 50000, rebate: { threshold: 500000, max: 12500, marginalRelief: false } },
      capitalGains: { stcg111a: 20, ltcg112a: 12.5, ltcg112aExemption: 125000, ltcg112: 12.5 }
    },
    '2026-27': {
      assessmentYear: '2027-28',
      newRegime: { slabs: NEW_SLABS_2025_26, standardDeduction: 75000, rebate: { threshold: 1200000, max: 60000, marginalRelief: true } },
      oldRegime: { slabs: OLD_SLABS, standardDeduction: 50000, rebate: { threshold: 500000, max: 12500, marginalRelief: false } },
      capitalGains: { stcg111a: 20, ltcg112a: 12.5, ltcg112aExemption: 125000, ltcg112: 12.5 }
    }
  };

  var DEFAULT_FY = '2026-27';

  function getFinancialYear(fy) {
    return FINANCIAL_YEARS[fy] || FINANCIAL_YEARS[DEFAULT_FY];
  }

  function financialYearList() {
    return Object.keys(FINANCIAL_YEARS).sort();
  }

  /** Current Indian FY label for a Date (defaults to today). */
  function currentFinancialYear(date) {
    var d = date instanceof Date ? date : new Date();
    var y = d.getFullYear();
    var startYear = d.getMonth() >= 3 ? y : y - 1;
    var end = String((startYear + 1) % 100);
    if (end.length < 2) end = '0' + end;
    return startYear + '-' + end;
  }

  /* -------------------------------------------------
     Helpers
     ------------------------------------------------- */
  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function nonNegative(value) {
    return Math.max(0, num(value));
  }

  function round2(n) { return Math.round((num(n) + Number.EPSILON) * 100) / 100; }

  function slabFor(regime, age) {
    var ageGroup = 'below60';
    if (num(age) >= 80) ageGroup = 'superSenior';
    else if (num(age) >= 60) ageGroup = 'senior';
    if (regime === 'old') return OLD_SLABS[ageGroup];
    return null; // new regime has a single table
  }

  /** Slab tax plus a per-slab breakdown. */
  function computeSlabTax(taxableIncome, slabs) {
    var income = nonNegative(taxableIncome);
    var remaining = income;
    var previous = 0;
    var tax = 0;
    var breakdown = [];
    (slabs || []).forEach(function (slab) {
      if (remaining <= 0) return;
      var width = slab.upTo === Infinity ? remaining : Math.min(remaining, slab.upTo - previous);
      if (width > 0) {
        var amount = round2(width * slab.rate / 100);
        tax = round2(tax + amount);
        breakdown.push({ from: previous, to: slab.upTo === Infinity ? null : slab.upTo, rate: slab.rate, taxable: round2(width), tax: amount });
        remaining = round2(remaining - width);
      }
      previous = slab.upTo;
    });
    return { tax: round2(tax), breakdown: breakdown };
  }

  /* -------------------------------------------------
     Salary
     ------------------------------------------------- */
  /** HRA exemption: least of (actual HRA, rent − 10% of basic+DA, 50%/40% of basic+DA). */
  function hraExemption(input) {
    var hra = nonNegative(input && input.hraReceived);
    var rent = nonNegative(input && input.rentPaid);
    var basic = nonNegative(input && input.basicDa);
    var metro = !!(input && input.metro);
    if (!hra || !rent || !basic) return 0;
    var percent = metro ? 0.5 : 0.4;
    var candidates = [
      hra,
      Math.max(0, rent - 0.1 * basic),
      percent * basic
    ];
    return round2(Math.min.apply(null, candidates));
  }

  function professionalTaxAllowed(regime) {
    return regime === 'old' ? 2500 : 0;
  }

  /* -------------------------------------------------
     House property
     ------------------------------------------------- */
  /**
   * Income from house property.
   * `letOut`: [{ annualRent, municipalTaxes, homeLoanInterest }]
   * `selfOccupiedInterest`: section 24(b) interest on a self-occupied house.
   */
  function housePropertyIncome(input) {
    var data = input || {};
    var letOut = Array.isArray(data.letOut) ? data.letOut : [];
    var letOutTotal = 0;
    letOut.forEach(function (prop) {
      var rent = nonNegative(prop.annualRent);
      var taxes = Math.min(nonNegative(prop.municipalTaxes), rent);
      var netAnnual = rent - taxes;
      var standardDeduction = round2(netAnnual * 0.3);
      var interest = nonNegative(prop.homeLoanInterest);
      letOutTotal = round2(letOutTotal + (netAnnual - standardDeduction - interest));
    });
    var selfOccupied = -Math.min(nonNegative(data.selfOccupiedInterest), 200000);
    var total = round2(letOutTotal + selfOccupied);
    // Loss from house property set-off is capped at ₹2,00,000 per year.
    if (total < -200000) total = -200000;
    return { total: total, letOut: letOutTotal, selfOccupied: selfOccupied };
  }

  /* -------------------------------------------------
     Chapter VI-A deductions
     ------------------------------------------------- */
  var DEDUCTION_CAPS = {
    c80c: 150000, c80ccc: 150000, c80ccd1b: 50000, c80d: 100000,
    c80tta: 10000, c80ttb: 50000, c80gg: 60000, c80dd: 125000, c80ddb: 125000,
    c80u: 125000, c80e: Infinity, c80g: Infinity, c80ggc: Infinity
  };

  /**
   * Apply Chapter VI-A deductions for the selected regime.
   * The new regime allows only 80CCD(2) (employer NPS), 80JJAA, family pension
   * deduction and the standard deduction – everything else is disallowed.
   */
  function applyDeductions(deductions, options) {
    var d = deductions || {};
    var opts = options || {};
    var regime = opts.regime === 'old' ? 'old' : 'new';
    var age = num(opts.age);
    var grossSalary = nonNegative(opts.grossSalary);
    var basicDa = nonNegative(opts.basicDa);
    var items = {};
    var total = 0;

    var add = function (key, amount, cap, label) {
      var claimed = Math.min(nonNegative(amount), cap === undefined ? Infinity : cap);
      if (claimed <= 0) return;
      items[key] = { label: label, claimed: round2(claimed), limit: cap === Infinity || cap === undefined ? null : cap };
      total = round2(total + claimed);
    };

    if (regime === 'old') {
      add('c80c', d.c80c, DEDUCTION_CAPS.c80c, '80C – investments (PF, LIC, ELSS, PPF, principal)');
      add('c80ccc', d.c80ccc, DEDUCTION_CAPS.c80ccc, '80CCC – pension fund');
      add('c80ccd1b', d.c80ccd1b, DEDUCTION_CAPS.c80ccd1b, '80CCD(1B) – additional NPS');
      add('c80d', d.c80d, DEDUCTION_CAPS.c80d, '80D – health insurance');
      add('c80dd', d.c80dd, DEDUCTION_CAPS.c80dd, '80DD – dependent with disability');
      add('c80ddb', d.c80ddb, DEDUCTION_CAPS.c80ddb, '80DDB – specified illnesses');
      add('c80e', d.c80e, Infinity, '80E – education loan interest');
      add('c80g', d.c80g, Infinity, '80G – donations');
      add('c80gg', d.c80gg, DEDUCTION_CAPS.c80gg, '80GG – rent paid (no HRA)');
      add('c80ggc', d.c80ggc, Infinity, '80GGC – political contribution');
      add('c80u', d.c80u, DEDUCTION_CAPS.c80u, '80U – self disability');
      add('c80tta', d.c80tta, age >= 60 ? 0 : DEDUCTION_CAPS.c80tta, '80TTA – savings bank interest');
      add('c80ttb', d.c80ttb, age >= 60 ? DEDUCTION_CAPS.c80ttb : 0, '80TTB – interest (senior citizen)');
      add('other', d.other, Infinity, 'Other eligible deductions');
    } else {
      // New regime: employer NPS contribution capped at 14% of basic+DA.
      var npsCap = round2(basicDa * 0.14);
      var employerNps = Math.min(nonNegative(d.employerNps), npsCap);
      if (employerNps > 0) {
        items.employerNps = { label: '80CCD(2) – employer NPS (max 14% of basic+DA)', claimed: round2(employerNps), limit: npsCap };
        total = round2(total + employerNps);
      }
      add('familyPension', d.familyPension, 25000, 'Family pension deduction (max ₹25,000)');
    }

    // No deduction may exceed gross salary (sanity guard for salary-only filers).
    if (grossSalary && total > grossSalary) {
      var scale = grossSalary / total;
      Object.keys(items).forEach(function (k) { items[k].claimed = round2(items[k].claimed * scale); });
      total = grossSalary;
    }

    return { total: round2(total), items: items };
  }

  /* -------------------------------------------------
     Surcharge + marginal relief
     ------------------------------------------------- */
  function surchargeRate(totalIncome, regime) {
    var income = nonNegative(totalIncome);
    if (income <= 5000000) return 0;
    if (income <= 10000000) return 10;
    if (income <= 20000000) return 15;
    if (income <= 50000000) return 25;
    return regime === 'old' ? 37 : 25; // the new regime caps surcharge at 25%
  }

  function surchargeThreshold(rate) {
    if (rate === 10) return 5000000;
    if (rate === 15) return 10000000;
    if (rate === 25) return 20000000;
    if (rate === 37) return 50000000;
    return 0;
  }

  /**
   * Surcharge with marginal relief.
   * `taxFn(income)` must return the slab tax before surcharge for that income.
   */
  function computeSurcharge(totalIncome, taxBeforeSurcharge, taxFn, regime) {
    var rate = surchargeRate(totalIncome, regime);
    var surcharge = round2(taxBeforeSurcharge * rate / 100);
    var marginalRelief = 0;
    if (rate > 0) {
      var threshold = surchargeThreshold(rate);
      var lowerRate = surchargeRate(threshold - 1, regime);
      var taxAtThreshold = round2(taxFn(threshold) * (1 + lowerRate / 100));
      var excessIncome = round2(totalIncome - threshold);
      var cap = round2(taxAtThreshold + excessIncome);
      var payable = round2(taxBeforeSurcharge + surcharge);
      if (payable > cap) {
        marginalRelief = round2(payable - cap);
        surcharge = round2(Math.max(0, surcharge - marginalRelief));
      }
    }
    return { rate: rate, surcharge: surcharge, marginalRelief: marginalRelief };
  }

  /* -------------------------------------------------
     Rebate u/s 87A
     ------------------------------------------------- */
  /**
   * Rebate is not available against income taxed at special rates
   * (111A, 112, 112A, lottery) – it applies to slab-taxed income only.
   */
  function computeRebate(params) {
    var p = params || {};
    var config = p.rebate || {};
    var totalIncome = nonNegative(p.totalIncome);
    var taxOnNormalIncome = nonNegative(p.taxOnNormalIncome);
    var hasSpecialIncome = !!p.hasSpecialIncome;
    var threshold = nonNegative(config.threshold);
    var maxRebate = nonNegative(config.max);

    if (!threshold || !maxRebate) return { rebate: 0, marginalRelief: 0, reason: 'no rebate configured' };
    if (totalIncome > threshold) {
      // Marginal relief just above the threshold – new regime only.
      if (!config.marginalRelief) return { rebate: 0, marginalRelief: 0, reason: 'income above threshold' };
      var excess = round2(totalIncome - threshold);
      var taxBefore = nonNegative(p.taxBeforeRebate);
      if (taxBefore <= excess) return { rebate: 0, marginalRelief: 0, reason: 'tax below excess income' };
      return {
        rebate: 0,
        marginalRelief: round2(taxBefore - excess),
        reason: 'marginal relief above ₹' + threshold.toLocaleString('en-IN')
      };
    }
    var rebate = Math.min(taxOnNormalIncome, maxRebate);
    return {
      rebate: round2(rebate),
      marginalRelief: 0,
      reason: hasSpecialIncome ? 'rebate restricted to slab-taxed income' : 'income within rebate threshold'
    };
  }

  /* -------------------------------------------------
     Full computation
     ------------------------------------------------- */
  /**
   * Compute tax for one regime.
   * @param {Object} input
   *   fy, regime ('new'|'old'), age, residentialStatus ('resident'|'nonResident')
   *   grossSalary, basicDa, hraReceived, rentPaid, metro, otherSalaryExemptions,
   *   letOutProperty[], selfOccupiedInterest, businessIncome, otherIncome,
   *   specialIncome { stcg111a, ltcg112a, ltcg112, lottery },
   *   deductions {...}, tdsPaid, advanceTaxPaid
   */
  function computeTax(input) {
    var data = input || {};
    var fy = getFinancialYear(data.fy);
    var regime = data.regime === 'old' ? 'old' : 'new';
    var config = regime === 'old' ? fy.oldRegime : fy.newRegime;
    var age = num(data.age);
    var resident = data.residentialStatus !== 'nonResident';
    var notes = [];

    /* ---- Salary ---- */
    var grossSalary = nonNegative(data.grossSalary);
    var salaryExemptions = 0;
    var hraExempt = 0;
    if (regime === 'old' && grossSalary) {
      hraExempt = hraExemption({ hraReceived: data.hraReceived, rentPaid: data.rentPaid, basicDa: data.basicDa, metro: data.metro });
      salaryExemptions = round2(hraExempt + nonNegative(data.otherSalaryExemptions));
    }
    var standardDeduction = Math.min(config.standardDeduction, grossSalary);
    var ptDeduction = Math.min(professionalTaxAllowed(regime), Math.max(0, grossSalary - standardDeduction - salaryExemptions));
    var salaryIncome = round2(Math.max(0, grossSalary - salaryExemptions - standardDeduction - ptDeduction));

    /* ---- House property ---- */
    var hp = housePropertyIncome({
      letOut: data.letOutProperty,
      selfOccupiedInterest: data.selfOccupiedInterest
    });

    /* ---- Gross total income ---- */
    var businessIncome = num(data.businessIncome);
    var otherIncome = nonNegative(data.otherIncome);
    var grossTotalIncome = round2(salaryIncome + hp.total + businessIncome + otherIncome);

    /* ---- Capital gains / special-rate income ---- */
    var cg = fy.capitalGains;
    var special = data.specialIncome || {};
    var stcg111a = nonNegative(special.stcg111a);
    var ltcg112aGross = nonNegative(special.ltcg112a);
    var ltcgExemption = Math.min(ltcg112aGross, cg.ltcg112aExemption);
    var ltcg112a = round2(Math.max(0, ltcg112aGross - ltcgExemption));
    var ltcg112 = nonNegative(special.ltcg112);
    var lottery = nonNegative(special.lottery);
    var specialIncome = round2(stcg111a + ltcg112a + ltcg112 + lottery);
    if (specialIncome > 0) notes.push('Special-rate income is taxed separately; Chapter VI-A deductions are not allowed against it.');

    /* ---- Deductions ---- */
    var deductionResult = applyDeductions(data.deductions, {
      regime: regime, age: age, grossSalary: grossSalary, basicDa: data.basicDa
    });
    // Chapter VI-A cannot be set against special-rate income.
    var normalGrossTotal = round2(Math.max(0, grossTotalIncome));
    var deductionsAllowed = Math.min(deductionResult.total, normalGrossTotal);
    var normalIncome = round2(Math.max(0, normalGrossTotal - deductionsAllowed));
    var totalIncome = round2(normalIncome + specialIncome);

    /* ---- Tax on slab income ---- */
    var slabs = regime === 'old' ? slabFor('old', age) : config.slabs;
    var slabResult = computeSlabTax(normalIncome, slabs);
    var taxOnNormal = slabResult.tax;

    /* ---- Tax on special-rate income ---- */
    var specialTax = 0;
    var specialBreakdown = [];
    var addSpecial = function (label, amount, rate) {
      if (amount <= 0) return;
      var tax = round2(amount * rate / 100);
      specialTax = round2(specialTax + tax);
      specialBreakdown.push({ label: label, income: round2(amount), rate: rate, tax: tax });
    };
    addSpecial('STCG u/s 111A', stcg111a, cg.stcg111a);
    addSpecial('LTCG u/s 112A', ltcg112a, cg.ltcg112a);
    addSpecial('LTCG u/s 112', ltcg112, cg.ltcg112);
    addSpecial('Lottery / winnings (115BB)', lottery, 30);
    if (ltcgExemption > 0 && ltcg112aGross > 0) {
      notes.push('LTCG u/s 112A: first ₹' + cg.ltcg112aExemption.toLocaleString('en-IN') + ' of gains is exempt.');
    }

    var taxBeforeRebate = round2(taxOnNormal + specialTax);

    /* ---- Rebate 87A (resident individuals only) ---- */
    var rebateResult = { rebate: 0, marginalRelief: 0, reason: 'not a resident individual' };
    if (resident) {
      rebateResult = computeRebate({
        totalIncome: totalIncome,
        taxOnNormalIncome: taxOnNormal,
        taxBeforeRebate: taxBeforeRebate,
        hasSpecialIncome: specialIncome > 0,
        rebate: config.rebate
      });
    } else if (totalIncome > 0) {
      notes.push('Rebate u/s 87A is available to resident individuals only.');
    }

    var taxAfterRebate = round2(Math.max(0, taxBeforeRebate - rebateResult.rebate - rebateResult.marginalRelief));

    /* ---- Surcharge + cess ---- */
    var surchargeResult = computeSurcharge(totalIncome, taxAfterRebate, function (income) {
      return computeSlabTax(income, slabs).tax;
    }, regime);
    var taxWithSurcharge = round2(taxAfterRebate + surchargeResult.surcharge);
    var cess = round2(taxWithSurcharge * CESS_RATE);
    var totalTax = round2(taxWithSurcharge + cess);

    /* ---- Taxes paid ---- */
    var tdsPaid = nonNegative(data.tdsPaid);
    var advanceTaxPaid = nonNegative(data.advanceTaxPaid);
    var taxesPaid = round2(tdsPaid + advanceTaxPaid);
    var balancePayable = round2(totalTax - taxesPaid);

    return {
      fy: (data.fy && FINANCIAL_YEARS[data.fy]) ? data.fy : DEFAULT_FY,
      regime: regime,
      regimeLabel: regime === 'old' ? 'Old regime (with deductions)' : 'New regime (default, 115BAC)',
      assessmentYear: fy.assessmentYear,
      ageGroup: age >= 80 ? 'Super senior (80+)' : age >= 60 ? 'Senior (60-79)' : 'Below 60',

      // income
      grossSalary: round2(grossSalary),
      salaryExemptions: round2(salaryExemptions),
      hraExemption: round2(hraExempt),
      standardDeduction: round2(standardDeduction),
      professionalTax: round2(ptDeduction),
      salaryIncome: salaryIncome,
      housePropertyIncome: hp.total,
      businessIncome: round2(businessIncome),
      otherIncome: round2(otherIncome),
      grossTotalIncome: grossTotalIncome,
      deductionTotal: round2(deductionsAllowed),
      deductions: deductionResult.items,
      normalIncome: normalIncome,

      // special income
      specialIncome: specialIncome,
      capitalGainsExemption: round2(ltcgExemption),
      specialBreakdown: specialBreakdown,

      totalIncome: totalIncome,

      // tax
      slabBreakdown: slabResult.breakdown,
      taxOnNormalIncome: taxOnNormal,
      taxOnSpecialIncome: specialTax,
      taxBeforeRebate: taxBeforeRebate,
      rebate87A: rebateResult.rebate,
      rebateMarginalRelief: rebateResult.marginalRelief,
      rebateReason: rebateResult.reason,
      taxAfterRebate: taxAfterRebate,
      surchargeRate: surchargeResult.rate,
      surcharge: surchargeResult.surcharge,
      surchargeMarginalRelief: surchargeResult.marginalRelief,
      cess: cess,
      totalTax: totalTax,

      // settlement
      tdsPaid: round2(tdsPaid),
      advanceTaxPaid: round2(advanceTaxPaid),
      taxesPaid: taxesPaid,
      balancePayable: balancePayable,
      refundDue: balancePayable < 0 ? round2(-balancePayable) : 0,

      effectiveRate: totalIncome > 0 ? round2(totalTax / totalIncome * 100) : 0,
      monthlyOutgo: round2(totalTax / 12),
      notes: notes
    };
  }

  /** Compute both regimes and recommend the cheaper one. */
  function compareRegimes(input) {
    var base = {};
    Object.keys(input || {}).forEach(function (k) { base[k] = input[k]; });
    base.regime = 'new';
    var newRegime = computeTax(base);
    base.regime = 'old';
    var oldRegime = computeTax(base);
    var saving = round2(oldRegime.totalTax - newRegime.totalTax);
    return {
      newRegime: newRegime,
      oldRegime: oldRegime,
      recommended: saving > 0 ? 'new' : saving < 0 ? 'old' : 'either',
      saving: Math.abs(saving),
      summary: saving > 0
        ? 'New regime saves ₹' + Math.abs(saving).toLocaleString('en-IN')
        : saving < 0
          ? 'Old regime saves ₹' + Math.abs(saving).toLocaleString('en-IN')
          : 'Both regimes give the same tax'
    };
  }

  /* -------------------------------------------------
     Advance tax (sections 234B / 234C helpers)
     ------------------------------------------------- */
  var ADVANCE_TAX_SCHEDULE = [
    { dueDate: '06-15', month: 6, cumulativePercent: 15, label: '15 June' },
    { dueDate: '09-15', month: 9, cumulativePercent: 45, label: '15 September' },
    { dueDate: '12-15', month: 12, cumulativePercent: 75, label: '15 December' },
    // The last instalment falls in March of the *next* calendar year.
    { dueDate: '03-15', month: 3, cumulativePercent: 100, label: '15 March' }
  ];

  /**
   * Advance tax instalments for a financial year.
   * Returns [] when the liability is below the ₹10,000 threshold.
   */
  function advanceTaxSchedule(totalTax, fy, paid) {
    var tax = nonNegative(totalTax);
    var year = getFinancialYear(fy);
    var fyLabel = fy && FINANCIAL_YEARS[fy] ? fy : DEFAULT_FY;
    var startYear = Number(fyLabel.slice(0, 4));
    if (tax < 10000) {
      return { applicable: false, reason: 'Advance tax applies only when the liability is ₹10,000 or more', instalments: [] };
    }
    var paidSoFar = nonNegative(paid);
    var instalments = ADVANCE_TAX_SCHEDULE.map(function (item, index) {
      var cumulative = round2(tax * item.cumulativePercent / 100);
      var previousCumulative = index === 0 ? 0 : round2(tax * ADVANCE_TAX_SCHEDULE[index - 1].cumulativePercent / 100);
      return {
        label: item.label,
        dueDate: (item.month === 3 ? startYear + 1 : startYear) + '-' + item.dueDate,
        cumulativePercent: item.cumulativePercent,
        cumulativeDue: cumulative,
        instalmentAmount: round2(cumulative - previousCumulative)
      };
    });
    return {
      applicable: true,
      totalTax: round2(tax),
      paid: round2(paidSoFar),
      balance: round2(tax - paidSoFar),
      instalments: instalments,
      assessmentYear: year.assessmentYear
    };
  }

  /**
   * Interest under 234B and 234C for a shortfall.
   * months are counted the way the Act does: part of a month counts as a full month.
   */
  function interest234(input) {
    var data = input || {};
    var assessedTax = nonNegative(data.assessedTax);
    var advanceTaxPaid = nonNegative(data.advanceTaxPaid);
    var shortfall = round2(assessedTax - advanceTaxPaid);
    var months234B = Math.max(0, num(data.months234B));
    var months234C = Math.max(0, num(data.months234C));
    var interestB = shortfall > 0 && advanceTaxPaid < assessedTax * 0.9
      ? round2(shortfall * 0.01 * months234B) : 0;
    var interestC = round2(Math.max(0, num(data.shortfall234C)) * 0.01 * months234C);
    return { interest234B: interestB, interest234C: interestC, total: round2(interestB + interestC), shortfall: shortfall };
  }

  /* -------------------------------------------------
     ITR form applicability
     ------------------------------------------------- */
  var ITR_FORMS = {
    'ITR-1': { name: 'Sahaj', who: 'Resident individual, income up to ₹50 lakh: salary/pension, one house property, interest, agricultural income up to ₹5,000' },
    'ITR-2': { name: 'Individual/HUF without business income', who: 'Individuals/HUF without business or profession income; capital gains, multiple house properties, foreign assets/income, income above ₹50 lakh' },
    'ITR-3': { name: 'Individual/HUF with business income', who: 'Individuals/HUF with income from business or profession, including presumptive opt-outs and F&O trading' },
    'ITR-4': { name: 'Sugam', who: 'Resident individual/HUF/firm with presumptive income u/s 44AD, 44ADA or 44AE; total income up to ₹50 lakh' },
    'ITR-5': { name: 'Firms/LLP/AOP/BOI', who: 'Firms, LLPs, AOPs, BOIs and artificial juridical persons (not companies or trusts)' },
    'ITR-6': { name: 'Companies', who: 'Companies other than those claiming exemption u/s 11' },
    'ITR-7': { name: 'Trusts/NGOs', who: 'Persons including companies filing u/s 139(4A), 139(4B), 139(4C) or 139(4D) – charitable trusts, political parties, research institutions' }
  };

  /**
   * Recommend an ITR form from simple facts about the taxpayer.
   * Returns { form, reasons[], alternatives[], mustFile }.
   */
  function recommendITRForm(profile) {
    var p = profile || {};
    var reasons = [];
    var entity = p.entityType || 'individual';

    if (entity === 'company') {
      reasons.push('You are filing for a company – ITR-6 applies unless you claim exemption u/s 11.');
      return { form: 'ITR-6', reasons: reasons, alternatives: [], mustFile: true };
    }
    if (entity === 'trust') {
      reasons.push('Trusts, NGOs and institutions filing u/s 139(4A)-(4D) use ITR-7.');
      return { form: 'ITR-7', reasons: reasons, alternatives: [], mustFile: true };
    }
    if (entity === 'firm' || entity === 'llp' || entity === 'aop') {
      reasons.push('Firms, LLPs and AOPs file ITR-5 (ITR-4 only if presumptive and eligible).');
      var firmForm = p.presumptive ? 'ITR-4' : 'ITR-5';
      return { form: firmForm, reasons: reasons, alternatives: p.presumptive ? ['ITR-5'] : ['ITR-4'], mustFile: true };
    }

    // Individuals / HUF
    var totalIncome = nonNegative(p.totalIncome);
    var isResident = p.residentialStatus !== 'nonResident';
    var hasBusiness = !!p.hasBusinessIncome;
    var hasCapitalGains = !!p.hasCapitalGains;
    var foreignAssets = !!p.foreignAssets;
    var houseProperties = num(p.houseProperties);
    var presumptive = !!p.presumptive;
    var agriIncome = nonNegative(p.agriculturalIncome);

    if (foreignAssets) reasons.push('Foreign assets or foreign income are reported in ITR-2/ITR-3, never ITR-1.');
    if (hasCapitalGains) reasons.push('Capital gains are not allowed in ITR-1/ITR-4.');
    if (hasBusiness) reasons.push('Business or profession income needs ITR-3 (or ITR-4 if presumptive).');
    if (houseProperties > 2) reasons.push('More than two house properties cannot be reported in ITR-1.');
    if (totalIncome > 5000000) reasons.push('Total income above ₹50 lakh rules out ITR-1 and ITR-4.');
    if (!isResident) reasons.push('Only residents can use ITR-1/ITR-4.');
    if (agriIncome > 5000) reasons.push('Agricultural income above ₹5,000 rules out ITR-1.');
    if (p.directorInCompany || p.unlistedShares) reasons.push('Being a director or holding unlisted shares rules out ITR-1.');

    var form;
    if (hasBusiness) {
      form = presumptive && isResident && totalIncome <= 5000000 && !hasCapitalGains && !foreignAssets ? 'ITR-4' : 'ITR-3';
    } else if (hasCapitalGains || foreignAssets || houseProperties > 2 || totalIncome > 5000000 ||
      agriIncome > 5000 || !isResident || p.directorInCompany || p.unlistedShares) {
      form = 'ITR-2';
    } else {
      form = 'ITR-1';
    }

    if (!reasons.length) reasons.push('Salary, one house property and interest income within the ITR-1 limits.');

    var mustFile = totalIncome > 250000 ||
      !!p.highValueTransaction || !!p.foreignAssets || !!p.refundClaim || !!p.electricitySpend;

    return {
      form: form,
      reasons: reasons,
      alternatives: form === 'ITR-1' ? ['ITR-2'] : form === 'ITR-4' ? ['ITR-3'] : [],
      mustFile: mustFile
    };
  }

  return {
    // config
    FINANCIAL_YEARS: FINANCIAL_YEARS,
    DEFAULT_FY: DEFAULT_FY,
    getFinancialYear: getFinancialYear,
    financialYearList: financialYearList,
    currentFinancialYear: currentFinancialYear,
    CESS_RATE: CESS_RATE,
    // pieces
    computeSlabTax: computeSlabTax,
    slabFor: slabFor,
    hraExemption: hraExemption,
    housePropertyIncome: housePropertyIncome,
    applyDeductions: applyDeductions,
    computeSurcharge: computeSurcharge,
    surchargeRate: surchargeRate,
    computeRebate: computeRebate,
    // main
    computeTax: computeTax,
    compareRegimes: compareRegimes,
    // compliance
    advanceTaxSchedule: advanceTaxSchedule,
    interest234: interest234,
    ADVANCE_TAX_SCHEDULE: ADVANCE_TAX_SCHEDULE,
    // ITR
    ITR_FORMS: ITR_FORMS,
    recommendITRForm: recommendITRForm
  };
});
