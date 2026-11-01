/* ===================================================
   TaxMitra – ITR JSON builder + validator
   Pure functions only: no DOM, no storage, no network.

   The JSON produced here is deliberately shaped like the Income Tax
   Department's return schema (PersonalInfo / IncomeDeductions /
   TaxComputation…) so a preparer can map it field by field into the
   official utility. It is NOT an e-filing payload and it is never
   submitted anywhere — `submitted` is always false and the disclaimer
   travels inside the file.
   =================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./income-tax.js'));
  } else {
    root.TMITRSchema = factory(root.TMIT);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TMIT) {
  'use strict';

  var PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  var TAN_REGEX = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
  var IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  var AADHAAR_REGEX = /^[0-9]{12}$/;

  var DISCLAIMER = 'Working paper only. This file is not a return of income, has not been ' +
    'validated by the Income Tax Department and has not been submitted anywhere.';

  /* ------------------------- helpers ------------------------- */

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

  function fyStart(fy) {
    var match = /^(\d{4})-(\d{2})$/.exec(String(fy || ''));
    return match ? Number(match[1]) : null;
  }

  /** FY 2025-26 → AY 2026-27 */
  function assessmentYear(fy) {
    var start = fyStart(fy);
    if (!start) return '';
    return String(start + 1) + '-' + String((start + 2) % 100).padStart(2, '0');
  }

  /** The FY that an assessment year belongs to (AY 2026-27 → FY 2025-26). */
  function fyForAssessmentYear(ay) {
    var match = /^(\d{4})-(\d{2})$/.exec(String(ay || ''));
    if (!match) return '';
    var ayStart = Number(match[1]);
    return String(ayStart - 1) + '-' + String(ayStart % 100).padStart(2, '0');
  }

  function supportedFinancialYears() {
    return typeof TMIT.financialYearList === 'function' ? TMIT.financialYearList() : [];
  }

  function safeState(state) {
    var s = state || {};
    return {
      profile: s.profile || {},
      income: s.income || {},
      gains: s.gains || {},
      deductions: s.deductions || {},
      taxes: s.taxes || {},
      fa: s.fa || null,
      chosenRegime: s.chosenRegime || 'auto'
    };
  }

  /* ------------------------- deduction caps ------------------------- */

  var CAPS = {
    c80c: 150000,
    c80ccd1b: 50000,
    c80ccd2: null,   // employer NPS: 10%/14% of salary, no flat cap
    c80d: null,      // age-dependent
    c80e: null,      // no cap
    c80g: null,      // qualifying amount dependent
    c80tta: 10000,
    c80ttb: 50000,
    c80u: null,
    other: null
  };

  function cap80D(age) {
    return num(age) >= 60 ? 50000 : 25000;
  }

  /* ------------------------- validation ------------------------- */

  /**
   * Validate a wizard state.
   * Returns { ok, errors: [{field, message, section}], warnings: [...] }
   * Errors are things that make the computation wrong or unfilable;
   * warnings are things a preparer should look at but that can be legitimate.
   */
  function validate(state) {
    var s = safeState(state);
    var errors = [];
    var warnings = [];
    var p = s.profile;
    var inc = s.income;
    var ded = s.deductions;
    var taxes = s.taxes;
    var gains = s.gains;

    function error(field, message, section) { errors.push({ field: field, message: message, section: section || 'General' }); }
    function warn(field, message, section) { warnings.push({ field: field, message: message, section: section || 'General' }); }

    /* --- taxpayer profile --- */
    var fy = String(p.fy || '');
    if (!fy) error('profile.fy', 'Financial year is missing.', 'PersonalInfo');
    else if (!/^\d{4}-\d{2}$/.test(fy)) error('profile.fy', 'Financial year must look like 2025-26.', 'PersonalInfo');
    else if (supportedFinancialYears().indexOf(fy) === -1) {
      error('profile.fy', 'No slab table exists for FY ' + fy + '. Choose ' + supportedFinancialYears().join(', ') + '.', 'PersonalInfo');
    }

    var pan = upper(p.pan);
    if (!pan) warn('profile.pan', 'PAN is blank — the utility will reject the return without it.', 'PersonalInfo');
    else if (!PAN_REGEX.test(pan)) error('profile.pan', 'PAN must be 5 letters, 4 digits and 1 letter (e.g. ABCDE1234F).', 'PersonalInfo');

    if (!String(p.name || '').trim()) warn('profile.name', 'Name is blank — PAN validation in the utility needs it.', 'PersonalInfo');

    var age = num(p.age);
    if (age < 0 || age > 120) error('profile.age', 'Age must be between 0 and 120.', 'PersonalInfo');
    if (p.entityType && p.entityType !== 'individual') {
      if (age) warn('profile.age', 'Age is only used for individual slab selection; it is ignored for a ' + p.entityType + '.', 'PersonalInfo');
      if (s.chosenRegime === 'new') warn('chosenRegime', 'The new regime is the default for all taxpayers, but slab logic in this build is written for individuals and HUFs.', 'TaxComputation');
    }
    if (p.aadhaar && !AADHAAR_REGEX.test(upper(p.aadhaar))) {
      error('profile.aadhaar', 'Aadhaar must be 12 digits.', 'PersonalInfo');
    }

    /* --- income --- */
    Object.keys({ grossSalary: 1, businessIncome: 1, otherIncome: 1, hraReceived: 1, rentPaid: 1, selfOccupiedInterest: 1 }).forEach(function (key) {
      if (num(inc[key]) < 0) error('income.' + key, key + ' cannot be negative.', 'Income');
    });

    if (num(inc.grossSalary) > 0 && num(inc.basicDa) > num(inc.grossSalary)) {
      error('income.basicDa', 'Basic + DA cannot exceed gross salary.', 'Income');
    }
    if (num(inc.hraReceived) > num(inc.grossSalary)) {
      error('income.hraReceived', 'HRA received cannot exceed gross salary.', 'Income');
    }
    if (num(inc.rentPaid) > 0 && num(inc.hraReceived) === 0) {
      warn('income.rentPaid', 'Rent is entered but no HRA was received — no HRA exemption is available.', 'Income');
    }
    if (num(inc.profTax) > 0 && p.entityType && p.entityType !== 'individual' && p.entityType !== 'huf') {
      warn('income.profTax', 'Professional tax is only deductible for individuals and HUFs.', 'Income');
    }
    (inc.letOut || []).forEach(function (prop, index) {
      if (num(prop.rent) < 0) error('income.letOut.' + index, 'Rent received for a let-out property cannot be negative.', 'Income');
      if (num(prop.interest) < 0) error('income.letOut.' + index, 'Interest for a let-out property cannot be negative.', 'Income');
    });

    /* --- capital gains --- */
    if (num(gains.stcg111a) < 0) error('gains.stcg111a', 'Short-term gains cannot be negative — use a negative entry only if you know the set-off rules.', 'CapitalGains');
    if (num(gains.ltcg112a) < 0 || num(gains.ltcg112) < 0) error('gains.ltcg', 'Long-term gains cannot be negative.', 'CapitalGains');

    /* --- deductions --- */
    ['c80c', 'c80ccd1b', 'c80ccd2', 'c80d', 'c80e', 'c80g', 'c80tta', 'c80ttb', 'c80u', 'other'].forEach(function (key) {
      if (num(ded[key]) < 0) error('deductions.' + key, key + ' cannot be negative.', 'Deductions');
    });
    if (num(ded.c80c) > CAPS.c80c) {
      warn('deductions.c80c', '80C is capped at ₹1,50,000; only the cap will be used in the computation.', 'Deductions');
    }
    if (num(ded.c80ccd1b) > CAPS.c80ccd1b) {
      warn('deductions.c80ccd1b', '80CCD(1B) is capped at ₹50,000.', 'Deductions');
    }
    if (num(ded.c80d) > cap80D(age)) {
      warn('deductions.c80d', '80D is capped at ₹' + cap80D(age).toLocaleString('en-IN') + ' for age ' + (age || 0) + '.', 'Deductions');
    }
    if (num(ded.c80tta) > 0 && age >= 60) {
      error('deductions.c80tta', '80TTA is not available to senior citizens — use 80TTB instead.', 'Deductions');
    }
    if (num(ded.c80ttb) > 0 && age < 60) {
      error('deductions.c80ttb', '80TTB is only for resident senior citizens (60+).', 'Deductions');
    }
    if (num(ded.c80tta) > CAPS.c80tta) warn('deductions.c80tta', '80TTA is capped at ₹10,000.', 'Deductions');
    if (num(ded.c80ttb) > CAPS.c80ttb) warn('deductions.c80ttb', '80TTB is capped at ₹50,000.', 'Deductions');
    if (num(ded.c80ccd1b) > 0 && num(inc.grossSalary) === 0 && num(inc.businessIncome) === 0) {
      warn('deductions.c80ccd1b', '80CCD(1B) needs salary or business income to be meaningful.', 'Deductions');
    }
    if (s.chosenRegime === 'new') {
      var blocked = ['c80c', 'c80d', 'c80e', 'c80g', 'c80tta', 'c80ttb', 'c80u', 'other'].filter(function (key) { return num(ded[key]) > 0; });
      if (blocked.length) {
        warn('chosenRegime', 'Chapter VI-A deductions (' + blocked.join(', ') + ') are not allowed in the new regime — they are ignored there.', 'Deductions');
      }
    }
    var totalDeductions = ['c80c', 'c80ccd1b', 'c80ccd2', 'c80d', 'c80e', 'c80g', 'c80tta', 'c80ttb', 'c80u', 'other']
      .reduce(function (acc, key) { return acc + num(ded[key]); }, 0);
    var grossTotal = num(inc.grossSalary) + num(inc.businessIncome) + num(inc.otherIncome) +
      num(gains.stcg111a) + num(gains.ltcg112a) + num(gains.ltcg112) + num(gains.lottery);
    if (totalDeductions > grossTotal && grossTotal > 0) {
      error('deductions', 'Total deductions exceed total income.', 'Deductions');
    }

    /* --- taxes paid --- */
    if (num(taxes.tdsPaid) < 0) error('taxes.tdsPaid', 'TDS cannot be negative.', 'TaxesPaid');
    if (num(taxes.advanceTaxPaid) < 0) error('taxes.advanceTaxPaid', 'Advance tax cannot be negative.', 'TaxesPaid');

    var result = null;
    try {
      result = TMIT.compareRegimes(computeInput(s));
    } catch (e) {
      error('computation', 'The tax engine could not compute this state: ' + e.message, 'TaxComputation');
    }

    if (result && result.newRegime) {
      var highestTax = Math.max(result.newRegime.totalTax, result.oldRegime.totalTax);
      if (num(taxes.tdsPaid) + num(taxes.advanceTaxPaid) > highestTax * 1.5 && highestTax > 0) {
        warn('taxes', 'Taxes paid look high against the computed liability — check TDS and advance tax against 26AS / AIS.', 'TaxesPaid');
      }
      var band = result.newRegime.totalIncome > 1200000 && result.newRegime.totalIncome <= 1275000;
      if (band && result.newRegime.rebateMarginalRelief > 0) {
        warn('computation', 'Income is in the marginal-relief band (₹12,00,000–₹12,75,000); relief of ₹' +
          result.newRegime.rebateMarginalRelief.toLocaleString('en-IN') + ' is being applied.', 'TaxComputation');
      }
    }

    /* --- form recommendation consistency --- */
    var rec = null;
    if (result && result.newRegime) {
      rec = TMIT.recommendITRForm({
        entityType: p.entityType, totalIncome: result.newRegime.totalIncome, presumptive: p.presumptive,
        hasBusinessIncome: p.hasBusinessIncome, hasCapitalGains: p.hasCapitalGains || result.newRegime.specialIncome > 0,
        foreignAssets: p.foreignAssets, houseProperties: p.houseProperties,
        residentialStatus: p.residentialStatus, directorInCompany: p.directorInCompany,
        unlistedShares: p.unlistedShares
      });
      if (p.entityType === 'individual' && rec.form !== 'ITR-1' && rec.form !== 'ITR-2' && rec.form !== 'ITR-3' && rec.form !== 'ITR-4') {
        warn('form', 'The engine recommends ' + rec.form + ' — confirm the entity type.', 'Filing');
      }
    }

    /* --- Schedule FA --- */
    if (p.foreignAssets) {
      var fa = s.fa;
      var entries = (fa && fa.entries) || [];
      if (!entries.length) {
        error('fa.entries', 'Foreign assets are flagged, so Schedule FA needs at least one entry (or clear the flag).', 'ScheduleFA');
      }
      entries.forEach(function (entry, index) {
        if (!String(entry.country || '').trim()) error('fa.entries.' + index + '.country', 'Schedule FA entry ' + (index + 1) + ' needs a country.', 'ScheduleFA');
        if (!String(entry.entity || '').trim()) error('fa.entries.' + index + '.entity', 'Schedule FA entry ' + (index + 1) + ' needs the name of the entity or account.', 'ScheduleFA');
        if (num(entry.peakValue) < num(entry.closingValue) && num(entry.peakValue) === 0) {
          warn('fa.entries.' + index, 'Schedule FA entry ' + (index + 1) + ' has a closing value but no peak value.', 'ScheduleFA');
        }
        if (entry.ifsc && !IFSC_REGEX.test(upper(entry.ifsc))) {
          error('fa.entries.' + index + '.ifsc', 'IFSC must look like HDFC0001234.', 'ScheduleFA');
        }
      });
    } else if (s.fa && (s.fa.entries || []).length) {
      warn('profile.foreignAssets', 'Schedule FA entries exist but the foreign-assets flag is off — they will not be exported.', 'ScheduleFA');
    }

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  /* ------------------------- computation input ------------------------- */

  function computeInput(state) {
    var s = safeState(state);
    var p = s.profile, inc = s.income, ded = s.deductions, gains = s.gains, taxes = s.taxes;
    return {
      fy: p.fy,
      age: p.age,
      residentialStatus: p.residentialStatus,
      grossSalary: inc.grossSalary,
      basicDa: inc.basicDa,
      hraReceived: inc.hraReceived,
      rentPaid: inc.rentPaid,
      metro: inc.metro,
      otherSalaryExemptions: inc.otherSalaryExemptions,
      selfOccupiedInterest: inc.selfOccupiedInterest,
      letOutProperty: inc.letOut || [],
      businessIncome: inc.businessIncome,
      otherIncome: inc.otherIncome,
      specialIncome: {
        stcg111a: gains.stcg111a,
        ltcg112a: gains.ltcg112a,
        ltcg112: gains.ltcg112,
        lottery: gains.lottery
      },
      deductions: {
        c80c: ded.c80c,
        c80ccd1b: ded.c80ccd1b,
        c80ccd2: ded.c80ccd2,
        c80d: ded.c80d,
        c80e: ded.c80e,
        c80g: ded.c80g,
        c80tta: ded.c80tta,
        c80ttb: ded.c80ttb,
        c80u: ded.c80u,
        other: ded.other
      },
      tdsPaid: taxes.tdsPaid,
      advanceTaxPaid: taxes.advanceTaxPaid
    };
  }

  /* ------------------------- ITR JSON ------------------------- */

  function personalInfo(p) {
    return {
      AssesseeName: { SurNameOrOrgName: String(p.name || '').trim() },
      PAN: upper(p.pan),
      AadhaarCardNo: upper(p.aadhaar || ''),
      Status: p.entityType || 'I',
      ResidentialStatus: p.residentialStatus || 'RES',
      Address: {
        ResidenceNo: p.address || '',
        CityOrTownOrDistrict: p.city || '',
        StateCode: p.stateCode || '',
        PinCode: p.pinCode || ''
      },
      AssessmentYear: assessmentYear(p.fy),
      FinancialYear: p.fy || ''
    };
  }

  function incomeDeductions(state, computation) {
    var s = safeState(state);
    var inc = s.income, ded = s.deductions;
    var chosen = computation.proposed;
    return {
      GrossSalary: round2(inc.grossSalary),
      SalaryExemptions: {
        HRA: round2(chosen.hraExemption),
        StandardDeduction: round2(chosen.standardDeduction),
        ProfessionalTax: round2(chosen.professionalTax),
        OtherExemptions: round2(inc.otherSalaryExemptions)
      },
      NetSalary: round2(chosen.salaryIncome),
      HouseProperty: {
        SelfOccupiedInterest: round2(inc.selfOccupiedInterest),
        LetOutCount: (inc.letOut || []).length,
        IncomeFromHouseProperty: round2(chosen.housePropertyIncome)
      },
      BusinessIncome: round2(inc.businessIncome),
      OtherIncome: round2(inc.otherIncome),
      CapitalGains: {
        ShortTerm111A: round2(s.gains.stcg111a),
        LongTerm112A: round2(s.gains.ltcg112a),
        LongTerm112: round2(s.gains.ltcg112)
      },
      GrossTotalIncome: round2(chosen.grossTotalIncome),
      Deductions: {
        Section80C: round2(ded.c80c),
        Section80CCD1B: round2(ded.c80ccd1b),
        Section80CCD2: round2(ded.c80ccd2),
        Section80D: round2(ded.c80d),
        Section80E: round2(ded.c80e),
        Section80G: round2(ded.c80g),
        Section80TTA: round2(ded.c80tta),
        Section80TTB: round2(ded.c80ttb),
        Section80U: round2(ded.c80u),
        OtherDeductions: round2(ded.other),
        TotalDeductions: round2(chosen.deductionTotal),
        Note: chosen.regime === 'new'
          ? 'Only 80CCD(2) and the family-pension deduction are allowed in the new regime; the other amounts you entered are listed for reference only.'
          : 'Amounts as claimed, capped as per the Act.'
      },
      TotalIncome: round2(chosen.totalIncome)
    };
  }

  function taxComputation(state, computation) {
    var s = safeState(state);
    var chosen = computation.proposed;
    return {
      Regime: chosen.regime === 'old' ? 'Old' : 'New',
      TaxOnNormalIncome: round2(chosen.taxOnNormalIncome),
      TaxOnSpecialIncome: round2(chosen.taxOnSpecialIncome),
      TaxOnTotalIncome: round2(chosen.taxBeforeRebate),
      Rebate87A: round2(chosen.rebate87A),
      Surcharge: round2(chosen.surcharge),
      SurchargeRate: chosen.surchargeRate,
      HealthAndEducationCess: round2(chosen.cess),
      TotalTaxPayable: round2(chosen.totalTax),
      TaxesPaid: {
        TDS: round2(s.taxes.tdsPaid),
        AdvanceTax: round2(s.taxes.advanceTaxPaid),
        SelfAssessmentTax: round2(s.taxes.selfAssessmentTax)
      },
      RefundOrPayable: round2(chosen.balancePayable),
      RefundDue: round2(chosen.refundDue),
      MarginalRelief: round2(chosen.rebateMarginalRelief)
    };
  }

  function scheduleFA(state) {
    var s = safeState(state);
    var fa = s.fa || {};
    var entries = fa.entries || [];
    return {
      Applicable: !!s.profile.foreignAssets,
      ForeignBankAccounts: entries.filter(function (e) { return (e.type || 'bank') === 'bank'; }).map(faEntry),
      ForeignEquityDebt: entries.filter(function (e) { return e.type === 'equity' || e.type === 'rsu' || e.type === 'espp'; }).map(faEntry),
      OtherForeignAssets: entries.filter(function (e) { return e.type === 'other' || !e.type; }).map(faEntry),
      TotalPeakValue: round2(entries.reduce(function (acc, e) { return acc + num(e.peakValue); }, 0)),
      TotalClosingValue: round2(entries.reduce(function (acc, e) { return acc + num(e.closingValue); }, 0)),
      ConversionRateSource: fa.rateSource || 'user-entered SBI TT buying rate (rule 115)'
    };
  }

  function faEntry(entry) {
    return {
      CountryName: entry.country || '',
      CountryCode: entry.countryCode || '',
      EntityName: entry.entity || '',
      AccountNumber: entry.accountNumber || '',
      Address: entry.address || '',
      IFSC: upper(entry.ifsc || ''),
      NatureOfAsset: entry.type || 'bank',
      AcquisitionDate: entry.acquired || '',
      InitialValue: round2(entry.initialValue),
      PeakValue: round2(entry.peakValue),
      ClosingValue: round2(entry.closingValue),
      IncomeIncludedInTotalIncome: !!entry.incomeIncluded
    };
  }

  /**
   * Build the working paper. `options.form` may force a form; otherwise the
   * engine's recommendation is used.
   */
  function build(state, options) {
    var opts = options || {};
    var s = safeState(state);
    var validation = validate(state);
    var input = computeInput(s);
    var comparison = TMIT.compareRegimes(input);
    // compareRegimes() recommends 'new' | 'old' | 'either'.
    var proposed = s.chosenRegime === 'old' ? comparison.oldRegime
      : s.chosenRegime === 'new' ? comparison.newRegime
        : (comparison.recommended === 'old' ? comparison.oldRegime : comparison.newRegime);
    var computation = {
      newRegime: comparison.newRegime,
      oldRegime: comparison.oldRegime,
      proposed: proposed,
      recommended: comparison.recommended,
      recommendedRegime: comparison.recommended,
      saving: comparison.saving,
      summary: comparison.summary,
      totalIncome: proposed.totalIncome,
      specialIncome: proposed.specialIncome,
      grossTotalIncome: proposed.grossTotalIncome
    };
    var p = s.profile;
    var rec = TMIT.recommendITRForm({
      entityType: p.entityType, totalIncome: comparison.newRegime.totalIncome, presumptive: p.presumptive,
      hasBusinessIncome: p.hasBusinessIncome, hasCapitalGains: p.hasCapitalGains || comparison.newRegime.specialIncome > 0,
      foreignAssets: p.foreignAssets, houseProperties: p.houseProperties,
      residentialStatus: p.residentialStatus, directorInCompany: p.directorInCompany,
      unlistedShares: p.unlistedShares
    });
    var form = opts.form || rec.form;

    return {
      app: 'TaxMitra AI Enterprise',
      document: 'ITR computation working paper (ITD-schema shaped)',
      schemaShape: 'Department-style PersonalInfo / IncomeDeductions / TaxComputation — map field by field into the official utility.',
      generatedAt: opts.now || new Date().toISOString(),
      submitted: false,
      disclaimer: DISCLAIMER,
      form: form,
      formReasons: rec.reasons,
      AY: assessmentYear(p.fy),
      FY: p.fy,
      ITR: buildFormKey(form, {
        CreationInfo: {
          SWVersionNo: 'TaxMitra 10.1',
          SWCreatedBy: 'TaxMitra AI Enterprise',
          JSONCreatedBy: options_creator(opts),
          JSONCreationDate: (opts.now || new Date().toISOString()).slice(0, 10),
          IntermediaryCity: p.city || ''
        },
        PersonalInfo: personalInfo(p),
        FilingStatus: {
          ReturnFileSec: p.filingReason === 'notice' ? 11 : 11,
          OptOutNewTaxRegime: s.chosenRegime === 'old',
          SeventhProvisoFlag: !!rec.reasons && rec.reasons.join(' ').indexOf('7th proviso') !== -1
        },
        IncomeDeductions: incomeDeductions(s, computation),
        TaxComputation: taxComputation(s, computation),
        ScheduleFA: scheduleFA(s),
        Verification: {
          Declaration: true,
          Capacity: 'Self',
          Note: 'Not verified — this working paper is not filed.'
        }
      }),
      comparison: {
        newRegime: comparison.newRegime,
        oldRegime: comparison.oldRegime,
        recommendedRegime: comparison.recommended,
        summary: comparison.summary,
        savingUnderRecommended: round2(comparison.saving)
      },
      validation: validation
    };
  }

  function options_creator(opts) {
    return opts.creator || 'TaxMitra user (unsigned)';
  }

  function buildFormKey(form, payload) {
    var key = String(form || 'ITR-1').replace('-', '');
    var out = {};
    out[key] = payload;
    return out;
  }

  function toJson(state, options) {
    return JSON.stringify(build(state, options), null, 2);
  }

  /** Human-readable summary of a validation result, for toasts and panels. */
  function describe(validation) {
    var v = validation || { errors: [], warnings: [] };
    return {
      errorCount: v.errors.length,
      warningCount: v.warnings.length,
      headline: v.errors.length
        ? v.errors.length + ' error(s) must be fixed before this can be filed'
        : (v.warnings.length ? v.warnings.length + ' warning(s) to review' : 'No validation issues found'),
      lines: v.errors.concat(v.warnings).map(function (item) {
        return (v.errors.indexOf(item) !== -1 ? '✗ ' : '⚠ ') + item.section + ': ' + item.message;
      })
    };
  }

  return {
    DISCLAIMER: DISCLAIMER,
    CAPS: CAPS,
    PAN_REGEX: PAN_REGEX,
    TAN_REGEX: TAN_REGEX,
    IFSC_REGEX: IFSC_REGEX,
    assessmentYear: assessmentYear,
    supportedFinancialYears: supportedFinancialYears,
    fyForAssessmentYear: fyForAssessmentYear,
    cap80D: cap80D,
    computeInput: computeInput,
    validate: validate,
    build: build,
    toJson: toJson,
    describe: describe
  };
});
