'use strict';

var t = require('./harness');
var path = require('path');

var S = require(path.join(__dirname, '..', 'js', 'itr-schema.js'));
var TMIT = require(path.join(__dirname, '..', 'js', 'income-tax.js'));
var suite = t.suite;
var test = t.test;

function baseState(overrides) {
  var state = {
    profile: {
      fy: '2025-26', entityType: 'individual', name: 'Asha Ramesh Kulkarni', pan: 'ABCDE1234F',
      age: 34, residentialStatus: 'resident', houseProperties: 1, filingReason: 'voluntary',
      hasBusinessIncome: false, hasCapitalGains: false, presumptive: false, foreignAssets: false,
      directorInCompany: false, unlistedShares: false
    },
    income: {
      grossSalary: 1275000, basicDa: 600000, hraReceived: 240000, rentPaid: 180000, metro: true,
      otherSalaryExemptions: 0, selfOccupiedInterest: 0, businessIncome: 0, otherIncome: 0,
      profTax: 2400, letOut: []
    },
    gains: { stcg111a: 0, ltcg112a: 0, ltcg112: 0, lottery: 0 },
    deductions: {
      c80c: 150000, c80ccd1b: 50000, c80d: 25000, c80e: 0, c80g: 0, c80tta: 0, c80ttb: 0,
      c80u: 0, other: 0, c80ccd2: 0, employerNps: 0, familyPension: 0
    },
    taxes: { tdsPaid: 60000, advanceTaxPaid: 0 },
    fa: { entries: [] },
    chosenRegime: 'auto'
  };
  Object.keys(overrides || {}).forEach(function (section) {
    var value = overrides[section];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!state[section] || typeof state[section] !== 'object') state[section] = {};
      Object.keys(value).forEach(function (key) { state[section][key] = value[key]; });
    } else {
      state[section] = overrides[section];
    }
  });
  return state;
}

function fields(issues) {
  return issues.map(function (i) { return i.field; });
}

suite('ITR schema · assessment year mapping', function () {
  test('FY maps to the following assessment year', function () {
    t.equal(S.assessmentYear('2025-26'), '2026-27');
    t.equal(S.assessmentYear('2024-25'), '2025-26');
    t.equal(S.assessmentYear('2026-27'), '2027-28');
  });

  test('the mapping is reversible and junk gives an empty string', function () {
    t.equal(S.fyForAssessmentYear('2026-27'), '2025-26');
    t.equal(S.fyForAssessmentYear('2024-25'), '2023-24');
    t.equal(S.assessmentYear('nonsense'), '');
    t.equal(S.assessmentYear(''), '');
  });

  test('the 80D cap depends on age', function () {
    t.equal(S.cap80D(34), 25000);
    t.equal(S.cap80D(60), 50000);
  });
});

suite('ITR schema · validation', function () {
  test('a clean salaried state validates', function () {
    var result = S.validate(baseState());
    t.equal(result.ok, true);
    t.equal(result.errors.length, 0);
  });

  test('a malformed PAN is a blocking error', function () {
    var result = S.validate(baseState({ profile: { pan: 'ABCDE1234' } }));
    t.equal(result.ok, false);
    t.ok(fields(result.errors).indexOf('profile.pan') !== -1);
    t.equal(result.errors[0].section, 'PersonalInfo');
  });

  test('a missing PAN is only a warning', function () {
    var result = S.validate(baseState({ profile: { pan: '' } }));
    t.equal(result.ok, true);
    t.ok(fields(result.warnings).indexOf('profile.pan') !== -1);
  });

  test('an unsupported financial year is rejected', function () {
    var result = S.validate(baseState({ profile: { fy: '2019-20' } }));
    t.equal(result.ok, false);
    t.ok(fields(result.errors).indexOf('profile.fy') !== -1);
  });

  test('negative income and negative taxes are errors', function () {
    var result = S.validate(baseState({ income: { otherIncome: -5 }, taxes: { tdsPaid: -100 } }));
    t.equal(result.ok, false);
    t.ok(fields(result.errors).indexOf('income.otherIncome') !== -1);
    t.ok(fields(result.errors).indexOf('taxes.tdsPaid') !== -1);
  });

  test('HRA received above gross salary is an error', function () {
    var result = S.validate(baseState({ income: { hraReceived: 2000000 } }));
    t.ok(fields(result.errors).indexOf('income.hraReceived') !== -1);
  });

  test('deduction caps produce warnings, not errors', function () {
    var result = S.validate(baseState({ deductions: { c80c: 250000, c80ccd1b: 80000, c80d: 40000 } }));
    t.equal(result.ok, true, 'over-claiming a cap is a warning');
    var warned = fields(result.warnings);
    t.ok(warned.indexOf('deductions.c80c') !== -1);
    t.ok(warned.indexOf('deductions.c80ccd1b') !== -1);
    t.ok(warned.indexOf('deductions.c80d') !== -1);
  });

  test('80TTA and 80TTB are rejected for the wrong age group', function () {
    var senior = S.validate(baseState({ profile: { age: 65 }, deductions: { c80tta: 5000 } }));
    t.ok(fields(senior.errors).indexOf('deductions.c80tta') !== -1);
    var young = S.validate(baseState({ profile: { age: 30 }, deductions: { c80ttb: 5000 } }));
    t.ok(fields(young.errors).indexOf('deductions.c80ttb') !== -1);
  });

  test('deductions above total income are an error', function () {
    var result = S.validate(baseState({
      income: { grossSalary: 100000, hraReceived: 0, rentPaid: 0, profTax: 0, otherIncome: 0, businessIncome: 0 },
      deductions: { c80c: 150000 }
    }));
    t.ok(fields(result.errors).indexOf('deductions') !== -1);
  });

  test('chapter VI-A deductions under the new regime are flagged as ignored', function () {
    var result = S.validate(baseState({ chosenRegime: 'new' }));
    t.equal(result.ok, true);
    var message = result.warnings.map(function (w) { return w.message; }).join(' ');
    t.ok(message.indexOf('not allowed in the new regime') !== -1, message);
  });

  test('marginal relief in the 12L–12.75L band is called out', function () {
    // ₹13,00,000 gross − ₹75,000 standard deduction = ₹12,25,000, inside the band.
    var result = S.validate(baseState({
      income: { grossSalary: 1300000, hraReceived: 0, rentPaid: 0, basicDa: 600000, profTax: 0 }
    }));
    var message = result.warnings.map(function (w) { return w.message; }).join(' ');
    t.ok(message.indexOf('marginal-relief') !== -1, message);
  });

  test('a bad Aadhaar is an error', function () {
    var result = S.validate(baseState({ profile: { aadhaar: '1234' } }));
    t.ok(fields(result.errors).indexOf('profile.aadhaar') !== -1);
  });

  test('foreign assets require at least one Schedule FA entry', function () {
    var result = S.validate(baseState({ profile: { foreignAssets: true } }));
    t.equal(result.ok, false);
    t.ok(fields(result.errors).indexOf('fa.entries') !== -1);

    var withEntry = S.validate(baseState({
      profile: { foreignAssets: true },
      fa: { entries: [{ country: 'United States', entity: 'Broker Inc', type: 'equity', initialValue: 1000, peakValue: 1500, closingValue: 1400 }] }
    }));
    t.equal(withEntry.ok, true);
  });

  test('an incomplete Schedule FA entry is named with its index', function () {
    var result = S.validate(baseState({
      profile: { foreignAssets: true },
      fa: { entries: [{ country: '', entity: '', type: 'bank' }] }
    }));
    var f = fields(result.errors);
    t.ok(f.indexOf('fa.entries.0.country') !== -1);
    t.ok(f.indexOf('fa.entries.0.entity') !== -1);
  });

  test('a bad IFSC in Schedule FA is an error', function () {
    var result = S.validate(baseState({
      profile: { foreignAssets: true },
      fa: { entries: [{ country: 'UK', entity: 'HSBC', ifsc: 'BAD', type: 'bank' }] }
    }));
    t.ok(fields(result.errors).indexOf('fa.entries.0.ifsc') !== -1);
  });

  test('alternate minimum tax style profiles still validate', function () {
    var result = S.validate(baseState({ profile: { entityType: 'firm', age: 0 } }));
    t.equal(result.ok, true);
    t.ok(result.warnings.length >= 1, 'a firm should produce at least one advisory warning');
  });

  test('describe() summarises the result for a human', function () {
    var clean = S.describe(S.validate(baseState()));
    t.equal(clean.errorCount, 0);
    t.equal(clean.headline.indexOf('No validation issues'), 0);

    var broken = S.describe(S.validate(baseState({ profile: { pan: 'X' } })));
    t.equal(broken.errorCount, 1);
    t.ok(broken.headline.indexOf('error') !== -1);
    t.ok(broken.lines[0].indexOf('✗') === 0);
  });
});

suite('ITR schema · computation wiring', function () {
  test('the computation matches the engine exactly', function () {
    var state = baseState({ chosenRegime: 'old' });
    var input = S.computeInput(state);
    var engine = TMIT.computeTax(Object.assign({}, input, { regime: 'old' }));
    var doc = S.build(state);
    t.equal(doc.ITR.ITR1.TaxComputation.TotalTaxPayable, engine.totalTax);
    t.equal(doc.ITR.ITR1.IncomeDeductions.TotalIncome, engine.totalIncome);
    t.equal(doc.ITR.ITR1.IncomeDeductions.Deductions.TotalDeductions, engine.deductionTotal);
  });

  test('the new regime ignores 80C but still reports what was entered', function () {
    var doc = S.build(baseState({ chosenRegime: 'new' }));
    var ded = doc.ITR.ITR1.IncomeDeductions.Deductions;
    t.equal(ded.TotalDeductions, 0);
    t.equal(ded.Section80C, 150000, 'the entered figure is kept for reference');
    t.ok(ded.Note.indexOf('new regime') !== -1);
  });

  test('the old regime applies the 80C and 80CCD(1B) caps', function () {
    var doc = S.build(baseState({ chosenRegime: 'old' }));
    t.equal(doc.ITR.ITR1.IncomeDeductions.Deductions.TotalDeductions, 225000);
  });

  test('regime auto picks the cheaper one and reports the saving', function () {
    var doc = S.build(baseState());
    t.equal(doc.comparison.recommendedRegime, 'new');
    t.ok(doc.comparison.savingUnderRecommended > 0);
    t.equal(doc.ITR.ITR1.TaxComputation.Regime, 'New');
  });

  test('a forced regime is respected', function () {
    var doc = S.build(baseState({ chosenRegime: 'old' }));
    t.equal(doc.ITR.ITR1.TaxComputation.Regime, 'Old');
  });

  test('a refund shows as a negative balance payable', function () {
    var doc = S.build(baseState());
    t.ok(doc.ITR.ITR1.TaxComputation.RefundOrPayable < 0, 'a refund is negative');
    t.ok(doc.ITR.ITR1.TaxComputation.RefundDue > 0);
  });
});

suite('ITR schema · the exported document', function () {
  var doc = S.build(baseState({ profile: { stateCode: '27', city: 'Pune' } }), { now: '2026-11-01T10:00:00.000Z' });

  test('it is marked as a working paper that was never submitted', function () {
    t.equal(doc.submitted, false);
    t.ok(doc.disclaimer.indexOf('not a return of income') !== -1);
    t.ok(doc.document.indexOf('working paper') !== -1);
  });

  test('the schema-shaped payload carries the expected sections', function () {
    var itr = doc.ITR.ITR1;
    ['CreationInfo', 'PersonalInfo', 'FilingStatus', 'IncomeDeductions', 'TaxComputation', 'ScheduleFA', 'Verification'].forEach(function (section) {
      t.ok(itr[section], 'missing section ' + section);
    });
  });

  test('identification fields are upper-cased and complete', function () {
    var p = doc.ITR.ITR1.PersonalInfo;
    t.equal(p.PAN, 'ABCDE1234F');
    t.equal(p.AssessmentYear, '2026-27');
    t.equal(p.FinancialYear, '2025-26');
    t.equal(p.AssesseeName.SurNameOrOrgName, 'Asha Ramesh Kulkarni');
  });

  test('the recommended form and its reasons travel with the file', function () {
    t.equal(doc.form, 'ITR-1');
    t.ok(Array.isArray(doc.formReasons) && doc.formReasons.length > 0);
    t.ok(doc.ITR[Object.keys(doc.ITR)[0]], 'the form key holds the payload');
  });

  test('the generation timestamp is the one supplied', function () {
    t.equal(doc.generatedAt, '2026-11-01T10:00:00.000Z');
    t.equal(doc.ITR.ITR1.CreationInfo.JSONCreationDate, '2026-11-01');
  });

  test('a business-income state is recommended ITR-3 and keyed accordingly', function () {
    var business = S.build(baseState({
      profile: { hasBusinessIncome: true, presumptive: false },
      income: { businessIncome: 800000 }
    }));
    t.equal(business.form, 'ITR-3');
    t.ok(business.ITR.ITR3, 'the payload key should be ITR3');
  });

  test('the JSON is valid, parseable and self-describing', function () {
    var text = S.toJson(baseState());
    var parsed = JSON.parse(text);
    t.equal(parsed.submitted, false);
    t.equal(typeof parsed.disclaimer, 'string');
    t.ok(text.indexOf('"TotalIncome"') !== -1);
  });

  test('Schedule FA is exported only from real entries', function () {
    var doc2 = S.build(baseState({
      profile: { foreignAssets: true },
      fa: {
        rateSource: 'SBI TT buying rate on 31 March',
        entries: [
          { country: 'United States', entity: 'Broker Inc', type: 'rsu', initialValue: 500000, peakValue: 800000, closingValue: 750000, incomeIncluded: true },
          { country: 'Singapore', entity: 'DBS Bank', type: 'bank', accountNumber: '123', initialValue: 100000, peakValue: 120000, closingValue: 110000 }
        ]
      }
    }));
    t.equal(doc2.form, 'ITR-2', 'foreign assets push the taxpayer to ITR-2');
    var fa = doc2.ITR[Object.keys(doc2.ITR)[0]].ScheduleFA;
    t.equal(fa.Applicable, true);
    t.equal(fa.TotalPeakValue, 920000);
    t.equal(fa.TotalClosingValue, 860000);
    t.equal(fa.ForeignEquityDebt.length, 1);
    t.equal(fa.ForeignBankAccounts.length, 1);
    t.equal(fa.OtherForeignAssets.length, 0);
    t.equal(fa.ConversionRateSource, 'SBI TT buying rate on 31 March');
  });

  test('an empty state still builds a valid, zeroed document', function () {
    var empty = S.build({});
    t.equal(empty.submitted, false);
    t.equal(empty.ITR.ITR1.IncomeDeductions.TotalIncome, 0);
    t.equal(empty.ITR.ITR1.TaxComputation.TotalTaxPayable, 0);
    t.equal(empty.validation.ok, false, 'an empty state is honestly reported as missing required fields');
    t.ok(empty.validation.errors.length > 0);
  });

  test('validation findings are embedded in the export', function () {
    var broken = S.build(baseState({ profile: { pan: 'BAD' } }));
    t.equal(broken.validation.ok, false);
    t.ok(broken.validation.errors.length > 0);
  });

  test('the document never claims to be filed, verified or e-signed', function () {
    var text = S.toJson(baseState());
    t.equal(/"(submitted|verified|eSigned)":\s*true/.test(text), false);
    t.ok(text.indexOf('Not verified') !== -1);
  });
});
