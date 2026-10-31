'use strict';

var t = require('./harness');
var path = require('path');
var T = require(path.join(__dirname, '..', 'js', 'income-tax.js'));

var suite = t.suite;
var test = t.test;

/* Hand-checked expectations for FY 2025-26 / 2026-27 new regime:
   0–4L nil, 4–8L 5%, 8–12L 10%, 12–16L 15%, 16–20L 20%, 20–24L 25%, 24L+ 30%
   Standard deduction 75,000 · 87A rebate 60,000 up to 12L + marginal relief. */
suite('Income tax · slab engine', function () {
  var slabs = T.getFinancialYear('2026-27').newRegime.slabs;

  test('zero income is zero tax', function () {
    t.equal(T.computeSlabTax(0, slabs).tax, 0);
    t.equal(T.computeSlabTax(400000, slabs).tax, 0, 'up to ₹4 lakh is nil');
  });

  test('each cumulative slab boundary matches hand calculation', function () {
    t.equal(T.computeSlabTax(500000, slabs).tax, 5000);      // 1L @ 5%
    t.equal(T.computeSlabTax(800000, slabs).tax, 20000);     // 4L @ 5%
    t.equal(T.computeSlabTax(1000000, slabs).tax, 40000);    // + 2L @ 10%
    t.equal(T.computeSlabTax(1200000, slabs).tax, 60000);    // + 4L @ 10%
    t.equal(T.computeSlabTax(1600000, slabs).tax, 120000);   // + 4L @ 15%
    t.equal(T.computeSlabTax(2000000, slabs).tax, 200000);   // + 4L @ 20%
    t.equal(T.computeSlabTax(2400000, slabs).tax, 300000);   // + 4L @ 25%
    t.equal(T.computeSlabTax(3000000, slabs).tax, 480000);   // + 6L @ 30%
  });

  test('slab breakdown covers the whole income exactly once', function () {
    var result = T.computeSlabTax(2345678, slabs);
    var covered = result.breakdown.reduce(function (sum, b) { return sum + b.taxable; }, 0);
    t.close(covered, 2345678, 0.01, 'breakdown must cover the full income');
    var tax = result.breakdown.reduce(function (sum, b) { return sum + b.tax; }, 0);
    t.close(tax, result.tax, 0.01, 'breakdown tax must equal the total');
  });

  test('negative income is treated as zero', function () {
    t.equal(T.computeSlabTax(-500000, slabs).tax, 0);
  });

  test('FY 2024-25 uses the older six-slab table', function () {
    var oldSlabs = T.getFinancialYear('2024-25').newRegime.slabs;
    t.equal(T.computeSlabTax(300000, oldSlabs).tax, 0, 'FY24-25 nil limit was ₹3 lakh');
    t.equal(T.computeSlabTax(700000, oldSlabs).tax, 20000);
    t.equal(T.computeSlabTax(1000000, oldSlabs).tax, 50000);
  });

  test('old regime slabs differ by age', function () {
    var senior = T.slabFor('old', 65);
    var superSenior = T.slabFor('old', 85);
    var normal = T.slabFor('old', 40);
    t.equal(T.computeSlabTax(300000, normal).tax, 2500);
    t.equal(T.computeSlabTax(300000, senior).tax, 0, 'senior exemption is ₹3 lakh');
    t.equal(T.computeSlabTax(500000, superSenior).tax, 0, 'super senior exemption is ₹5 lakh');
    t.equal(T.computeSlabTax(1000000, superSenior).tax, 100000, 'super senior: 5L–10L @ 20%');
  });
});

suite('Income tax · rebate 87A and marginal relief', function () {
  test('new regime: ₹12 lakh total income pays nothing', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'new', grossSalary: 1275000 });
    t.equal(r.totalIncome, 1200000);
    t.equal(r.taxBeforeRebate, 60000);
    t.equal(r.rebate87A, 60000);
    t.equal(r.totalTax, 0);
  });

  test('new regime: ₹12,10,000 total income pays ₹10,400 thanks to marginal relief', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'new', grossSalary: 1285000 });
    t.equal(r.totalIncome, 1210000);
    t.equal(r.taxBeforeRebate, 61500);
    t.equal(r.rebateMarginalRelief, 51500);
    t.equal(r.totalTax, 10400, '₹10,000 tax + 4% cess');
    t.equal(r.rebate87A, 0, 'no full rebate above the threshold');
  });

  test('marginal relief fades out around ₹12.75 lakh', function () {
    var justOver = T.computeTax({ fy: '2026-27', regime: 'new', grossSalary: 1350000 }); // taxable 12,75,000
    var wellOver = T.computeTax({ fy: '2026-27', regime: 'new', grossSalary: 1400000 }); // taxable 13,25,000
    t.equal(justOver.rebateMarginalRelief, 0, 'relief should have expired exactly at the crossover');
    t.close(justOver.taxBeforeRebate, 71250, 1);
    t.ok(wellOver.totalTax > justOver.totalTax, 'tax must keep rising with income');
  });

  test('tax is continuous across the ₹12 lakh threshold', function () {
    var at12 = T.computeTax({ fy: '2026-27', regime: 'new', grossSalary: 1275000 });
    var just = T.computeTax({ fy: '2026-27', regime: 'new', grossSalary: 1276000 });
    t.equal(at12.totalTax, 0);
    t.close(just.totalTax, 1040, 50, 'one extra ₹1,000 of income must not create a ₹60,000 cliff');
  });

  test('old regime rebate is capped at ₹12,500 up to ₹5 lakh', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'old', grossSalary: 550000, deductions: { c80c: 0 } });
    t.equal(r.totalIncome, 497500);
    t.equal(r.rebate87A, 12375, 'rebate equals the tax on ₹4,97,500');
    t.equal(r.totalTax, 0);
  });

  test('old regime has no rebate above ₹5 lakh', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'old', grossSalary: 560000 });
    t.equal(r.rebate87A, 0);
    t.ok(r.totalTax > 0);
  });

  test('non-residents do not get the 87A rebate', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'new', residentialStatus: 'nonResident', grossSalary: 1275000 });
    t.equal(r.rebate87A, 0);
    t.ok(r.totalTax > 0, 'a non-resident at ₹12 lakh taxable income must pay tax');
    t.includes(r.notes.join(' '), 'resident');
  });

  test('rebate never exceeds the tax on slab income', function () {
    var r = T.computeRebate({ totalIncome: 900000, taxOnNormalIncome: 10000, taxBeforeRebate: 10000, rebate: { threshold: 1200000, max: 60000 } });
    t.equal(r.rebate, 10000);
  });
});

suite('Income tax · surcharge and cess', function () {
  test('surcharge rates follow the thresholds', function () {
    t.equal(T.surchargeRate(5000000, 'old'), 0);
    t.equal(T.surchargeRate(5000001, 'old'), 10);
    t.equal(T.surchargeRate(10000000, 'old'), 10);
    t.equal(T.surchargeRate(10000001, 'old'), 15);
    t.equal(T.surchargeRate(20000001, 'old'), 25);
    t.equal(T.surchargeRate(50000001, 'old'), 37);
  });

  test('the new regime caps surcharge at 25%', function () {
    t.equal(T.surchargeRate(60000000, 'new'), 25);
    t.equal(T.surchargeRate(60000000, 'old'), 37);
  });

  test('cess is always 4% of tax plus surcharge', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'new', grossSalary: 2000000 });
    t.close(r.cess, (r.taxAfterRebate + r.surcharge) * 0.04, 0.5);
    t.close(r.totalTax, r.taxAfterRebate + r.surcharge + r.cess, 0.5);
  });

  test('marginal relief stops a surcharge cliff at ₹50 lakh', function () {
    var at50 = T.computeTax({ fy: '2026-27', regime: 'old', grossSalary: 5000000 });
    var at51 = T.computeTax({ fy: '2026-27', regime: 'old', grossSalary: 5100000 });
    var jump = at51.totalTax - at50.totalTax;
    t.ok(jump > 0, 'tax must increase');
    t.ok(jump < 100000, 'the jump should be roughly the extra income, not a full surcharge slab: got ' + jump.toFixed(0));
  });

  test('marginal relief appears in the result when it applies', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'old', grossSalary: 5060000 });
    t.ok(r.surchargeMarginalRelief > 0, 'expected surcharge marginal relief to be positive');
    t.ok(r.surcharge < r.taxAfterRebate * 0.1, 'surcharge should be reduced by the relief');
  });

  test('very large income still produces a finite result', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'old', grossSalary: 100000000 });
    t.ok(isFinite(r.totalTax));
    t.ok(r.effectiveRate > 30 && r.effectiveRate < 45, 'effective rate should sit in a believable band, got ' + r.effectiveRate);
  });
});

suite('Income tax · salary, HRA and deductions', function () {
  test('HRA exemption is the least of the three limbs', function () {
    t.equal(T.hraExemption({ hraReceived: 240000, rentPaid: 300000, basicDa: 600000, metro: true }), 240000, 'actual HRA is the lowest');
    t.equal(T.hraExemption({ hraReceived: 500000, rentPaid: 200000, basicDa: 600000, metro: true }), 140000, 'rent − 10% of basic');
    t.equal(T.hraExemption({ hraReceived: 500000, rentPaid: 900000, basicDa: 600000, metro: true }), 300000, '50% of basic in a metro');
    t.equal(T.hraExemption({ hraReceived: 500000, rentPaid: 900000, basicDa: 600000, metro: false }), 240000, '40% of basic outside a metro');
  });

  test('HRA needs rent and basic to compute anything', function () {
    t.equal(T.hraExemption({ hraReceived: 200000, rentPaid: 0, basicDa: 500000 }), 0);
    t.equal(T.hraExemption({ hraReceived: 200000, rentPaid: 300000, basicDa: 0 }), 0);
    t.equal(T.hraExemption(null), 0);
  });

  test('standard deduction is capped at the salary itself', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'new', grossSalary: 50000 });
    t.equal(r.standardDeduction, 50000);
    t.equal(r.salaryIncome, 0);
  });

  test('professional tax is deducted only in the old regime', function () {
    var newRegime = T.computeTax({ fy: '2026-27', regime: 'new', grossSalary: 1000000 });
    var oldRegime = T.computeTax({ fy: '2026-27', regime: 'old', grossSalary: 1000000 });
    t.equal(newRegime.professionalTax, 0);
    t.equal(oldRegime.professionalTax, 2500);
  });

  test('HRA and extra exemptions work only in the old regime', function () {
    var input = { fy: '2026-27', grossSalary: 1200000, basicDa: 600000, hraReceived: 300000, rentPaid: 360000, metro: true };
    var newRegime = T.computeTax(Object.assign({ regime: 'new' }, input));
    var oldRegime = T.computeTax(Object.assign({ regime: 'old' }, input));
    t.equal(newRegime.hraExemption, 0, 'no HRA exemption in the new regime');
    t.ok(oldRegime.hraExemption > 0, 'HRA exemption applies in the old regime');
    t.equal(oldRegime.salaryExemptions, oldRegime.hraExemption);
  });

  test('80C is capped at ₹1,50,000', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'old', grossSalary: 1500000, deductions: { c80c: 400000 } });
    t.equal(r.deductionTotal, 150000);
    t.equal(r.deductions.c80c.claimed, 150000);
  });

  test('80CCD(1B) is capped at ₹50,000', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'old', grossSalary: 1500000, deductions: { c80ccd1b: 90000 } });
    t.equal(r.deductions.c80ccd1b.claimed, 50000);
  });

  test('80TTA and 80TTB respect the age condition', function () {
    var young = T.computeTax({ fy: '2026-27', regime: 'old', age: 40, grossSalary: 900000, deductions: { c80tta: 20000, c80ttb: 50000 } });
    var senior = T.computeTax({ fy: '2026-27', regime: 'old', age: 65, grossSalary: 900000, deductions: { c80tta: 20000, c80ttb: 50000 } });
    t.equal(young.deductions.c80tta.claimed, 10000);
    t.equal(young.deductions.c80ttb, undefined, '80TTB is not available below 60');
    t.equal(senior.deductions.c80ttb.claimed, 50000);
    t.equal(senior.deductions.c80tta, undefined, 'seniors use 80TTB instead of 80TTA');
  });

  test('the new regime ignores Chapter VI-A and keeps employer NPS up to 14% of basic', function () {
    var r = T.computeTax({
      fy: '2026-27', regime: 'new', grossSalary: 2000000, basicDa: 800000,
      deductions: { c80c: 150000, c80d: 25000, employerNps: 200000 }
    });
    t.equal(r.deductions.c80c, undefined, '80C must be ignored in the new regime');
    t.equal(r.deductions.c80d, undefined, '80D must be ignored in the new regime');
    t.equal(r.deductions.employerNps.claimed, 112000, '14% of ₹8,00,000 basic');
  });

  test('deductions cannot exceed gross total income', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'old', grossSalary: 300000, deductions: { c80c: 150000, c80d: 50000, c80e: 400000 } });
    t.ok(r.deductionTotal <= r.grossTotalIncome, 'deductions should not exceed gross total income');
    t.equal(r.totalIncome >= 0, true);
  });

  test('negative salary input does not create a negative tax', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'new', grossSalary: -500000 });
    t.equal(r.salaryIncome, 0);
    t.equal(r.totalTax, 0);
  });
});

suite('Income tax · house property', function () {
  test('self-occupied interest is capped at ₹2 lakh', function () {
    t.equal(T.housePropertyIncome({ selfOccupiedInterest: 350000 }).total, -200000);
    t.equal(T.housePropertyIncome({ selfOccupiedInterest: 150000 }).total, -150000);
  });

  test('let-out property gets 30% standard deduction and full interest', function () {
    var result = T.housePropertyIncome({ letOut: [{ annualRent: 300000, municipalTaxes: 20000, homeLoanInterest: 150000 }] });
    t.equal(result.total, 46000, '(300000 − 20000) × 70% − 150000');
  });

  test('municipal taxes cannot exceed the rent', function () {
    var result = T.housePropertyIncome({ letOut: [{ annualRent: 100000, municipalTaxes: 500000, homeLoanInterest: 0 }] });
    t.equal(result.total, 0);
  });

  test('total house property loss is capped at ₹2 lakh', function () {
    var result = T.housePropertyIncome({
      letOut: [{ annualRent: 100000, municipalTaxes: 0, homeLoanInterest: 500000 }],
      selfOccupiedInterest: 200000
    });
    t.equal(result.total, -200000);
  });

  test('house property flows into total income', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'new', grossSalary: 1200000, selfOccupiedInterest: 200000 });
    t.equal(r.housePropertyIncome, -200000);
    t.equal(r.totalIncome, 925000);
  });
});

suite('Income tax · capital gains and special rates', function () {
  test('STCG 111A is taxed at 20% and excluded from slab income', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'new', specialIncome: { stcg111a: 100000 } });
    t.equal(r.normalIncome, 0);
    t.equal(r.taxOnSpecialIncome, 20000);
    t.equal(r.totalIncome, 100000);
  });

  test('LTCG 112A gets the ₹1,25,000 exemption before 12.5%', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'new', specialIncome: { ltcg112a: 225000 } });
    t.equal(r.capitalGainsExemption, 125000);
    t.equal(r.taxOnSpecialIncome, 12500, '12.5% of ₹1,00,000');
  });

  test('LTCG 112A below the exemption is tax free', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'new', specialIncome: { ltcg112a: 100000 } });
    t.equal(r.taxOnSpecialIncome, 0);
    t.equal(r.capitalGainsExemption, 100000);
  });

  test('lottery winnings are taxed at 30%', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'new', specialIncome: { lottery: 100000 } });
    t.equal(r.taxOnSpecialIncome, 30000);
  });

  test('deductions cannot be set against special-rate income', function () {
    var withGains = T.computeTax({ fy: '2026-27', regime: 'old', grossSalary: 1000000, specialIncome: { stcg111a: 500000 }, deductions: { c80c: 150000 } });
    t.equal(withGains.normalIncome, 797500, 'deductions only reduce the salary part');
    t.equal(withGains.specialIncome, 500000);
  });

  test('a note explains the 87A restriction when gains exist', function () {
    var r = T.computeTax({ fy: '2026-27', regime: 'new', grossSalary: 900000, specialIncome: { stcg111a: 200000 } });
    t.includes(r.notes.join(' '), 'Special-rate');
  });
});

suite('Income tax · regime comparison', function () {
  test('compareRegimes computes both sides and a recommendation', function () {
    var c = T.compareRegimes({ fy: '2026-27', grossSalary: 1500000, deductions: { c80c: 150000 } });
    t.equal(c.newRegime.regime, 'new');
    t.equal(c.oldRegime.regime, 'old');
    t.equal(c.recommended, 'new');
    t.ok(c.saving > 0);
    t.includes(c.summary, 'New regime saves');
  });

  test('heavy deductions can flip the recommendation to the old regime', function () {
    var c = T.compareRegimes({
      fy: '2026-27', grossSalary: 1600000, basicDa: 800000, hraReceived: 480000, rentPaid: 600000, metro: true,
      selfOccupiedInterest: 200000, deductions: { c80c: 150000, c80ccd1b: 50000, c80d: 50000 }
    });
    t.equal(c.recommended, 'old', 'large HRA + 80C should favour the old regime here');
    t.ok(c.oldRegime.totalTax < c.newRegime.totalTax);
  });

  test('equal outcomes report "either"', function () {
    var c = T.compareRegimes({ fy: '2026-27', grossSalary: 0 });
    t.equal(c.recommended, 'either');
    t.equal(c.newRegime.totalTax, 0);
    t.equal(c.oldRegime.totalTax, 0);
  });
});

suite('Income tax · advance tax and interest', function () {
  test('no advance tax below ₹10,000 liability', function () {
    var schedule = T.advanceTaxSchedule(9000, '2026-27');
    t.equal(schedule.applicable, false);
    t.equal(schedule.instalments.length, 0);
  });

  test('instalments follow 15/45/75/100%', function () {
    var schedule = T.advanceTaxSchedule(100000, '2026-27');
    t.equal(schedule.applicable, true);
    t.deepEqual(schedule.instalments.map(function (i) { return i.cumulativePercent; }), [15, 45, 75, 100]);
    t.deepEqual(schedule.instalments.map(function (i) { return i.instalmentAmount; }), [15000, 30000, 30000, 25000]);
    t.equal(schedule.instalments[0].dueDate, '2026-06-15');
    t.equal(schedule.instalments[3].dueDate, '2027-03-15');
  });

  test('balance reflects tax already paid', function () {
    var schedule = T.advanceTaxSchedule(100000, '2026-27', 40000);
    t.equal(schedule.balance, 60000);
    t.equal(schedule.paid, 40000);
  });

  test('234B interest applies only when less than 90% was paid', function () {
    t.equal(T.interest234({ assessedTax: 100000, advanceTaxPaid: 95000, months234B: 4 }).interest234B, 0);
    t.equal(T.interest234({ assessedTax: 100000, advanceTaxPaid: 50000, months234B: 4 }).interest234B, 2000);
  });

  test('234C interest uses the supplied shortfall and months', function () {
    var result = T.interest234({ assessedTax: 100000, advanceTaxPaid: 100000, shortfall234C: 20000, months234C: 3 });
    t.equal(result.interest234C, 600);
    t.equal(result.total, 600);
  });
});

suite('Income tax · ITR form recommendation', function () {
  test('a simple salary case is ITR-1', function () {
    var rec = T.recommendITRForm({ totalIncome: 1200000 });
    t.equal(rec.form, 'ITR-1');
    t.equal(rec.mustFile, true);
    t.equal(rec.alternatives[0], 'ITR-2');
  });

  test('capital gains force ITR-2', function () {
    t.equal(T.recommendITRForm({ totalIncome: 900000, hasCapitalGains: true }).form, 'ITR-2');
  });

  test('more than two house properties force ITR-2', function () {
    t.equal(T.recommendITRForm({ totalIncome: 900000, houseProperties: 3 }).form, 'ITR-2');
    t.equal(T.recommendITRForm({ totalIncome: 900000, houseProperties: 2 }).form, 'ITR-1');
  });

  test('income above ₹50 lakh forces ITR-2', function () {
    t.equal(T.recommendITRForm({ totalIncome: 5000001 }).form, 'ITR-2');
    t.equal(T.recommendITRForm({ totalIncome: 4900000 }).form, 'ITR-1');
  });

  test('foreign assets and directorships force ITR-2', function () {
    t.equal(T.recommendITRForm({ totalIncome: 800000, foreignAssets: true }).form, 'ITR-2');
    t.equal(T.recommendITRForm({ totalIncome: 800000, directorInCompany: true }).form, 'ITR-2');
    t.equal(T.recommendITRForm({ totalIncome: 800000, unlistedShares: true }).form, 'ITR-2');
  });

  test('non-residents cannot use ITR-1', function () {
    t.equal(T.recommendITRForm({ totalIncome: 900000, residentialStatus: 'nonResident' }).form, 'ITR-2');
  });

  test('agricultural income above ₹5,000 rules out ITR-1', function () {
    t.equal(T.recommendITRForm({ totalIncome: 900000, agriculturalIncome: 6000 }).form, 'ITR-2');
    t.equal(T.recommendITRForm({ totalIncome: 900000, agriculturalIncome: 4000 }).form, 'ITR-1');
  });

  test('presumptive business income within limits is ITR-4', function () {
    var rec = T.recommendITRForm({ totalIncome: 2000000, hasBusinessIncome: true, presumptive: true });
    t.equal(rec.form, 'ITR-4');
    t.equal(rec.alternatives[0], 'ITR-3');
  });

  test('non-presumptive business income is ITR-3', function () {
    t.equal(T.recommendITRForm({ totalIncome: 2000000, hasBusinessIncome: true }).form, 'ITR-3');
  });

  test('presumptive with capital gains falls back to ITR-3', function () {
    t.equal(T.recommendITRForm({ totalIncome: 2000000, hasBusinessIncome: true, presumptive: true, hasCapitalGains: true }).form, 'ITR-3');
  });

  test('companies, firms and trusts map to their forms', function () {
    t.equal(T.recommendITRForm({ entityType: 'company' }).form, 'ITR-6');
    t.equal(T.recommendITRForm({ entityType: 'trust' }).form, 'ITR-7');
    t.equal(T.recommendITRForm({ entityType: 'firm' }).form, 'ITR-5');
    t.equal(T.recommendITRForm({ entityType: 'llp', presumptive: true }).form, 'ITR-4');
    t.equal(T.recommendITRForm({ entityType: 'aop' }).form, 'ITR-5');
  });

  test('every ITR form has a name and a description', function () {
    ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4', 'ITR-5', 'ITR-6', 'ITR-7'].forEach(function (form) {
      t.ok(T.ITR_FORMS[form], form + ' should be documented');
      t.ok(T.ITR_FORMS[form].name.length > 0);
      t.ok(T.ITR_FORMS[form].who.length > 20);
    });
  });

  test('reasons are always populated', function () {
    var rec = T.recommendITRForm({ totalIncome: 1200000 });
    t.ok(rec.reasons.length > 0);
    var rec2 = T.recommendITRForm({ totalIncome: 1200000, hasCapitalGains: true, foreignAssets: true });
    t.ok(rec2.reasons.length >= 2);
  });
});

suite('Income tax · financial year metadata', function () {
  test('known financial years are present with assessment years', function () {
    t.deepEqual(T.financialYearList(), ['2024-25', '2025-26', '2026-27']);
    t.equal(T.getFinancialYear('2026-27').assessmentYear, '2027-28');
    t.equal(T.getFinancialYear('2024-25').assessmentYear, '2025-26');
  });

  test('unknown financial years fall back to the default', function () {
    t.equal(T.getFinancialYear('1999-00').assessmentYear, T.getFinancialYear(T.DEFAULT_FY).assessmentYear);
  });

  test('currentFinancialYear respects the April cutoff', function () {
    t.equal(T.currentFinancialYear(new Date('2026-03-31T12:00:00Z')), '2025-26');
    t.equal(T.currentFinancialYear(new Date('2026-04-01T12:00:00Z')), '2026-27');
    t.matches(T.currentFinancialYear(), /^\d{4}-\d{2}$/);
  });

  test('budget 2026 kept the slabs unchanged for 2026-27', function () {
    var a = T.getFinancialYear('2025-26').newRegime.slabs;
    var b = T.getFinancialYear('2026-27').newRegime.slabs;
    t.deepEqual(a.map(function (s) { return s.rate; }), b.map(function (s) { return s.rate; }));
    t.equal(T.getFinancialYear('2026-27').newRegime.rebate.max, 60000);
  });
});
