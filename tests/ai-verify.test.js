'use strict';

var t = require('./harness');
var path = require('path');

var V = require(path.join(__dirname, '..', 'js', 'ai-verify.js'));
var TMIT = require(path.join(__dirname, '..', 'js', 'income-tax.js'));
var suite = t.suite;
var test = t.test;

/** The engine's own answer, formatted the way an AI answer usually is. */
function answerFor(income, fy) {
  var computed = V.computeOnIncome(income, { fy: fy || '2025-26' });
  return 'Aapka total tax ₹' + computed.totalTax.toLocaleString('en-IN') + ' hoga.';
}

suite('AI verify · reading numbers out of prose', function () {
  test('lakh, crore and rupee formats are understood', function () {
    t.equal(V.parseIncome('12 lakh income par tax?'), 1200000);
    t.equal(V.parseIncome('15L par kitna tax'), 1500000);
    t.equal(V.parseIncome('1.5 crore turnover'), 15000000);
    t.equal(V.parseIncome('₹12,00,000 salary'), 1200000);
    t.equal(V.parseIncome('income 1200000'), 1200000);
  });

  test('a question without an income yields null', function () {
    t.equal(V.parseIncome('80C kya hai?'), null);
    t.equal(V.parseIncome(''), null);
  });

  test('rupee figures are extracted with their context', function () {
    var figures = V.extractFigures('80C me ₹1,50,000 tak, aur total tax ₹0 hoga (87A).');
    t.equal(figures.length, 2);
    t.equal(figures[0].value, 150000);
    t.equal(figures[1].value, 0);
    t.ok(figures[1].context.indexOf('tax') !== -1);
  });

  test('a tax figure is told apart from a deduction figure', function () {
    var figures = V.extractFigures('80C cap ₹1,50,000 hai aur total tax ₹1,20,000 hai.');
    t.equal(V.isTaxFigure(figures[0]), false);
    t.equal(V.isTaxFigure(figures[1]), true);
  });

  test('junk amounts are ignored instead of becoming zero', function () {
    t.deepEqual(V.extractFigures('No amounts here.'), []);
    t.equal(V.toNumber('₹'), null);
  });
});

suite('AI verify · engine recomputation', function () {
  test('the stated income is treated as total income, not salary', function () {
    var computed = V.computeOnIncome(1200000, { fy: '2025-26' });
    var engine = TMIT.computeTax({ fy: '2025-26', regime: 'new', otherIncome: 1200000 });
    t.equal(computed.totalIncome, engine.totalIncome);
    t.equal(computed.totalTax, engine.totalTax);
  });

  test('the 87A rebate is applied for a resident individual', function () {
    var computed = V.computeOnIncome(1200000, { fy: '2025-26' });
    t.equal(computed.totalTax, 0);
    t.ok(computed.rebate87A > 0);
  });

  test('both regimes can be recomputed', function () {
    var newRegime = V.computeOnIncome(2000000, { fy: '2025-26', regime: 'new' });
    var oldRegime = V.computeOnIncome(2000000, { fy: '2025-26', regime: 'old' });
    t.ok(newRegime.totalTax > 0 && oldRegime.totalTax > 0);
    t.notEqual(newRegime.totalTax, oldRegime.totalTax);
  });

  test('the assessment year travels with the computation', function () {
    t.equal(V.computeOnIncome(1000000, { fy: '2025-26' }).assessmentYear, '2026-27');
  });
});

suite('AI verify · verification verdicts', function () {
  test('a correct answer is verified', function () {
    var result = V.verify({ question: '20 lakh income par total tax kitna hai?', answer: answerFor(2000000) });
    t.equal(result.status, 'verified');
    t.equal(result.delta, 0);
    t.equal(result.income, 2000000);
    t.ok(result.message.indexOf('Verified') === 0);
  });

  test('a rounded answer inside the tolerance still passes', function () {
    var exact = V.computeOnIncome(2000000, { fy: '2025-26' }).totalTax;
    var result = V.verify({
      question: '20 lakh par total tax?',
      answer: 'Aapka total tax ₹' + (exact + 60).toLocaleString('en-IN') + ' hai.'
    });
    t.equal(result.status, 'verified');
    t.ok(Math.abs(result.delta) === 60);
  });

  test('a wrong answer is flagged and the engine figure is shown', function () {
    var result = V.verify({
      question: '20 lakh income par total tax?',
      answer: 'Aapka total tax ₹1,50,000 hoga.'
    });
    t.equal(result.status, 'differs');
    t.equal(result.claimed, 150000);
    t.ok(result.computed.totalTax !== 150000);
    t.ok(result.message.indexOf('1,50,000') !== -1, 'the claim must be quoted');
    t.ok(result.message.indexOf(result.computed.totalTax.toLocaleString('en-IN')) !== -1, 'the engine figure must be quoted');
  });

  test('no income means unchecked, never a false green tick', function () {
    var result = V.verify({ question: '80C kya hai?', answer: '80C me ₹1,50,000 tak deduction milta hai.' });
    t.equal(result.status, 'unchecked');
    t.equal(result.reason, 'no_income');
    t.equal(result.income, null);
  });

  test('an income but no tax figure is unchecked with the reason', function () {
    var result = V.verify({ question: '12 lakh income par kaunse documents chahiye?', answer: 'Form 16 aur PAN chahiye.' });
    t.equal(result.status, 'unchecked');
    t.equal(result.reason, 'no_tax_figure');
    t.equal(result.income, 1200000);
    t.ok(result.computed, 'the engine still states what it would compute');
  });

  test('the final liability is preferred over an intermediate figure', function () {
    var exact = V.computeOnIncome(2500000, { fy: '2025-26' }).totalTax;
    var result = V.verify({
      question: '25 lakh par tax?',
      answer: 'Cess ₹' + Math.round(exact / 1.04) + ' hai aur total tax ₹' + exact.toLocaleString('en-IN') + ' hoga.'
    });
    t.equal(result.status, 'verified');
    t.equal(result.claimed, exact);
  });

  test('an explicit income argument wins over the question text', function () {
    var exact = V.computeOnIncome(1800000, { fy: '2025-26' }).totalTax;
    var result = V.verify({
      question: 'Meri income ke hisaab se tax?',
      answer: 'Total tax ₹' + exact.toLocaleString('en-IN'),
      income: 1800000
    });
    t.equal(result.status, 'verified');
    t.equal(result.income, 1800000);
  });

  test('the regime can be pinned for the comparison', function () {
    var oldTax = V.computeOnIncome(2000000, { fy: '2025-26', regime: 'old' }).totalTax;
    var result = V.verify({
      question: '20 lakh par purani regime me total tax?',
      answer: 'Total tax ₹' + oldTax.toLocaleString('en-IN'),
      regime: 'old'
    });
    t.equal(result.status, 'verified');
    t.equal(result.regime, 'old');
  });

  test('an empty answer is not verified', function () {
    t.equal(V.verify({ answer: '' }).status, 'unchecked');
    t.equal(V.verify({}).status, 'unchecked');
  });
});

suite('AI verify · presentation', function () {
  test('each verdict has a badge', function () {
    t.ok(V.badge({ status: 'verified' }).indexOf('Engine-verified') !== -1);
    t.ok(V.badge({ status: 'differs' }).indexOf('Engine disagrees') !== -1);
    t.ok(V.badge({ status: 'unchecked' }).indexOf('Not machine-checked') !== -1);
    t.equal(V.badge(null), '');
  });

  test('explain() never hides a mismatch', function () {
    var result = V.verify({ question: '20 lakh par total tax?', answer: 'Total tax ₹1,50,000' });
    t.ok(V.explain(result).indexOf('engine computes') !== -1);
  });

  test('the badge markup is safe to inject', function () {
    var badge = V.badge({ status: 'differs' });
    t.equal(/<script/i.test(badge), false);
    t.ok(badge.indexOf('<span') === 0);
  });
});
