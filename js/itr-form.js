/* ===================================================
   TaxMitra – ITR Preparation Wizard (ITR-1 to ITR-7)
   Guides a taxpayer through the schedules, computes tax under
   both regimes with TMIT, recommends the correct ITR form and
   exports a JSON working paper.

   LIMITS: this prepares a computation and an editable working
   paper. It does NOT submit a return to the Income Tax portal.
   =================================================== */
(function () {
  'use strict';

  var T = window.TMIT;
  var S = window.TMStore;

  if (!T) {
    document.addEventListener('DOMContentLoaded', function () {
      var el = document.getElementById('appError');
      if (el) { el.style.display = 'block'; el.textContent = 'Could not load the income tax engine (js/income-tax.js missing).'; }
    });
    return;
  }

  var TOTAL_STEPS = 7;

  var state = {
    step: 1,
    profile: {
      fy: T.currentFinancialYear(),
      entityType: 'individual',
      name: '',
      pan: '',
      age: 30,
      residentialStatus: 'resident',
      houseProperties: 1,
      hasCapitalGains: false,
      hasBusinessIncome: false,
      presumptive: false,
      foreignAssets: false,
      directorInCompany: false,
      unlistedShares: false,
      highValueTransaction: false,
      filingReason: 'voluntary'
    },
    income: {
      grossSalary: 0, basicDa: 0, hraReceived: 0, rentPaid: 0, metro: false,
      otherSalaryExemptions: 0, selfOccupiedInterest: 0, businessIncome: 0,
      otherIncome: 0, letOut: []
    },
    gains: { stcg111a: 0, ltcg112a: 0, ltcg112: 0, lottery: 0 },
    deductions: {
      c80c: 0, c80ccd1b: 0, c80d: 0, c80e: 0, c80g: 0, c80tta: 0, c80ttb: 0,
      c80u: 0, other: 0, employerNps: 0, familyPension: 0
    },
    taxes: { tdsPaid: 0, advanceTaxPaid: 0 },
    chosenRegime: 'auto'
  };

  var PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

  /* ------------------------- helpers ------------------------- */
  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function inr(n, decimals) {
    var v = Number(n) || 0;
    try {
      return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: decimals === undefined ? 2 : decimals, maximumFractionDigits: decimals === undefined ? 2 : decimals });
    } catch (e) {
      return '₹' + v.toFixed(2);
    }
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function setPath(obj, path, value) {
    var parts = path.split('.');
    var target = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) target[parts[i]] = {};
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;
  }

  function getPath(obj, path) {
    return path.split('.').reduce(function (acc, key) {
      return acc === null || acc === undefined ? undefined : acc[key];
    }, obj);
  }

  /* ------------------------- computation ------------------------- */
  function buildInput(regime) {
    var p = state.profile;
    var i = state.income;
    return {
      fy: p.fy,
      regime: regime,
      age: num(p.age),
      residentialStatus: p.residentialStatus,
      grossSalary: num(i.grossSalary),
      basicDa: num(i.basicDa),
      hraReceived: num(i.hraReceived),
      rentPaid: num(i.rentPaid),
      metro: !!i.metro,
      otherSalaryExemptions: num(i.otherSalaryExemptions),
      selfOccupiedInterest: num(i.selfOccupiedInterest),
      letOutProperty: (i.letOut || []).map(function (prop) {
        return { annualRent: num(prop.annualRent), municipalTaxes: num(prop.municipalTaxes), homeLoanInterest: num(prop.homeLoanInterest) };
      }),
      businessIncome: num(i.businessIncome),
      otherIncome: num(i.otherIncome),
      specialIncome: {
        stcg111a: num(state.gains.stcg111a),
        ltcg112a: num(state.gains.ltcg112a),
        ltcg112: num(state.gains.ltcg112),
        lottery: num(state.gains.lottery)
      },
      deductions: state.deductions,
      tdsPaid: num(state.taxes.tdsPaid),
      advanceTaxPaid: num(state.taxes.advanceTaxPaid)
    };
  }

  function compare() {
    var result = T.compareRegimes(buildInput('new'));
    return result;
  }

  function activeResult(comparison) {
    if (state.chosenRegime === 'old') return comparison.oldRegime;
    if (state.chosenRegime === 'new') return comparison.newRegime;
    return comparison.recommended === 'old' ? comparison.oldRegime : comparison.newRegime;
  }

  /* ------------------------- validation ------------------------- */
  function validateStep(step) {
    var errors = [];
    var p = state.profile;
    if (step === 1) {
      if (!p.name.trim()) errors.push('Enter the taxpayer name as it appears on the PAN.');
      if (!PAN_REGEX.test(String(p.pan || '').toUpperCase())) errors.push('PAN must be 5 letters, 4 digits and 1 letter (e.g. ABCDE1234F).');
      if (p.age === '' || num(p.age) < 0 || num(p.age) > 120) errors.push('Enter a valid age between 0 and 120.');
      if (!p.fy) errors.push('Select the financial year.');
    }
    if (step === 2) {
      var i = state.income;
      if (num(i.grossSalary) < 0) errors.push('Salary cannot be negative.');
      if (num(i.basicDa) > num(i.grossSalary) && num(i.grossSalary) > 0) errors.push('Basic + DA cannot exceed the gross salary.');
      if (num(i.rentPaid) > 0 && num(i.basicDa) === 0) errors.push('Enter Basic + DA so the HRA exemption can be computed.');
      if (num(i.selfOccupiedInterest) > 200000) errors.push('Section 24(b) interest on a self-occupied house is capped at ₹2,00,000.');
      (i.letOut || []).forEach(function (prop, index) {
        if (num(prop.municipalTaxes) > num(prop.annualRent) && num(prop.annualRent) > 0) {
          errors.push('Let-out property ' + (index + 1) + ': municipal taxes cannot exceed the annual rent.');
        }
      });
    }
    if (step === 3) {
      var g = state.gains;
      Object.keys(g).forEach(function (key) {
        if (num(g[key]) < 0) errors.push('Capital gains / special income cannot be negative.');
      });
      if (num(g.ltcg112a) > 0 && p.residentialStatus === 'nonResident') {
        errors.push('Section 112A concessional treatment has residential-status conditions – confirm with your CA before proceeding.');
      }
    }
    if (step === 4) {
      var d = state.deductions;
      if (num(d.c80c) > 150000) errors.push('80C is capped at ₹1,50,000 – enter the eligible amount, not the amount invested.');
      if (num(d.c80ccd1b) > 50000) errors.push('80CCD(1B) is capped at ₹50,000.');
      if (num(d.c80tta) > 10000) errors.push('80TTA is capped at ₹10,000.');
      if (num(d.employerNps) > 0 && num(state.income.basicDa) === 0) {
        errors.push('Enter Basic + DA in step 2 so the 14% employer NPS cap can be checked.');
      }
      if (num(p.age) < 60 && num(d.c80ttb) > 0) errors.push('80TTB is available to senior citizens only.');
    }
    return errors;
  }

  function warnings(result) {
    var list = [];
    var p = state.profile;
    if (num(p.age) >= 60 && state.chosenRegime !== 'old' && num(state.deductions.c80ttb) > 0) {
      list.push('80TTB is ignored in the new regime – the deduction only exists under the old regime.');
    }
    if (result.rebate87A > 0) {
      list.push('Rebate u/s 87A of ' + inr(result.rebate87A, 0) + ' has been applied. It is not available against special-rate income such as 111A/112A gains.');
    }
    if (result.specialIncome > 0) {
      list.push('Special-rate income of ' + inr(result.specialIncome, 0) + ' is taxed separately; Chapter VI-A deductions cannot reduce it.');
    }
    if (result.surcharge > 0) {
      list.push('Surcharge at ' + result.surchargeRate + '% applies. Marginal relief has been applied where relevant.');
    }
    if (result.totalIncome > 5000000 && (p.entityType === 'individual')) {
      list.push('Total income is above ₹50 lakh, so ITR-1/ITR-4 are not available and Schedule AL (assets & liabilities) becomes mandatory.');
    }
    if (p.hasBusinessIncome && !p.presumptive) {
      list.push('Business income without presumptive taxation normally needs books of account, tax audit consideration and ITR-3.');
    }
    if (num(state.taxes.tdsPaid) > 0 && result.refundDue === 0 && result.balancePayable > 0) {
      list.push('TDS entered is less than the computed liability – check Form 26AS/AIS and pay the balance (advance tax / self-assessment).');
    }
    if (result.refundDue > 0) {
      list.push('A refund of ' + inr(result.refundDue, 0) + ' appears due. Verify the TDS credits in Form 26AS/AIS before filing.');
    }
    if (state.income.letOut && state.income.letOut.length > 2) {
      list.push('Loss from house property set-off is restricted to ₹2,00,000 per year.');
    }
    return list;
  }

  /* ------------------------- rendering ------------------------- */
  function renderStepNav() {
    var host = $('stepNav');
    if (!host) return;
    var labels = ['Profile', 'Income', 'Capital gains', 'Deductions', 'Regime', 'Taxes paid', 'Review'];
    host.innerHTML = labels.map(function (label, index) {
      var number = index + 1;
      var cls = number === state.step ? 'active' : number < state.step ? 'done' : '';
      return '<button type="button" class="' + cls + '" data-goto="' + number + '"' + (number <= maxVisitedStep() ? '' : ' disabled') + '>' +
        '<span>' + number + '</span>' + esc(label) + '</button>';
    }).join('');
  }

  var visited = 1;
  function maxVisitedStep() { return Math.max(visited, state.step); }

  function render() {
    for (var i = 1; i <= TOTAL_STEPS; i++) {
      var panel = $('step' + i);
      if (panel) panel.hidden = i !== state.step;
    }
    renderStepNav();
    setText('stepLabel', 'Step ' + state.step + ' of ' + TOTAL_STEPS);
    var errHost = $('stepErrors');
    if (errHost) { errHost.hidden = true; errHost.innerHTML = ''; }
    if (state.step === 5) renderComparison();
    if (state.step === 6) renderAdvanceTax();
    if (state.step === 7) renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setText(id, text) { var el = $(id); if (el) el.textContent = text; }

  function showErrors(errors) {
    var host = $('stepErrors');
    if (!host) return;
    host.innerHTML = '<strong>Please check the following:</strong><ul>' +
      errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
    host.hidden = false;
    if (typeof host.scrollIntoView === 'function') host.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function bindInputs() {
    document.querySelectorAll('[data-bind]').forEach(function (el) {
      var path = el.getAttribute('data-bind');
      // initial value
      var current = getPath(state, path);
      if (el.type === 'checkbox') el.checked = !!current;
      else if (current !== undefined && current !== null) el.value = current;

      var handler = function () {
        var value;
        if (el.type === 'checkbox') value = el.checked;
        else if (el.type === 'number') value = el.value === '' ? 0 : Number(el.value);
        else value = el.value;
        if (el.getAttribute('data-upper') === 'true') {
          value = String(value).toUpperCase();
          el.value = value;
        }
        setPath(state, path, value);
        if (path === 'profile.pan' || path === 'profile.name') updateProfileHint();
        if (path.indexOf('profile.') === 0) {
          // Recommended form reacts to the profile flags immediately.
          renderFormRecommendation();
        }
        saveDraft();
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });
  }

  function updateProfileHint() {
    var pan = String(state.profile.pan || '').toUpperCase();
    var hint = $('panHint');
    if (!hint) return;
    if (!pan) { hint.textContent = 'PAN format: ABCDE1234F'; hint.className = 'field-hint'; return; }
    var valid = PAN_REGEX.test(pan);
    hint.textContent = valid ? 'PAN format looks correct' : 'PAN must be 5 letters, 4 digits, 1 letter';
    hint.className = 'field-hint ' + (valid ? 'ok' : 'bad');
  }

  function renderFormRecommendation() {
    var host = $('formRecommendation');
    if (!host) return;
    var rec = T.recommendITRForm({
      entityType: state.profile.entityType,
      totalIncome: estimateTotalIncome(),
      presumptive: state.profile.presumptive,
      hasBusinessIncome: state.profile.hasBusinessIncome,
      hasCapitalGains: state.profile.hasCapitalGains,
      foreignAssets: state.profile.foreignAssets,
      houseProperties: state.profile.houseProperties,
      residentialStatus: state.profile.residentialStatus,
      directorInCompany: state.profile.directorInCompany,
      unlistedShares: state.profile.unlistedShares,
      agriculturalIncome: num($('agriIncome') ? $('agriIncome').value : 0)
    });
    var meta = T.ITR_FORMS[rec.form] || { name: '', who: '' };
    host.innerHTML = '<div class="rec-card"><strong>Suggested form: ' + esc(rec.form) + ' – ' + esc(meta.name) + '</strong>' +
      '<p>' + esc(meta.who) + '</p><ul>' + rec.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div>';
  }

  function estimateTotalIncome() {
    try {
      return activeResult(compare()).totalIncome;
    } catch (e) {
      return num(state.income.grossSalary) + num(state.income.businessIncome) + num(state.income.otherIncome);
    }
  }

  /* ------------------------- step 5: comparison ------------------------- */
  function renderComparison() {
    var c = compare();
    var chosen = activeResult(c);
    var host = $('comparisonBody');
    if (!host) return;

    var rows = [
      ['Gross salary', 'grossSalary', true],
      ['Exemptions (HRA etc.)', 'salaryExemptions', true],
      ['Standard deduction', 'standardDeduction', true],
      ['Income from salary', 'salaryIncome', true],
      ['Income from house property', 'housePropertyIncome', true],
      ['Business / profession', 'businessIncome', true],
      ['Other income', 'otherIncome', true],
      ['Gross total income', 'grossTotalIncome', true],
      ['Chapter VI-A deductions', 'deductionTotal', true],
      ['Income taxed at slab rates', 'normalIncome', true],
      ['Special-rate income', 'specialIncome', true],
      ['Total income', 'totalIncome', true],
      ['Tax on slab income', 'taxOnNormalIncome', true],
      ['Tax on special-rate income', 'taxOnSpecialIncome', true],
      ['Rebate u/s 87A', 'rebate87A', true],
      ['Marginal relief (87A)', 'rebateMarginalRelief', true],
      ['Surcharge', 'surcharge', true],
      ['Health & education cess', 'cess', true],
      ['Total tax liability', 'totalTax', true]
    ];

    host.innerHTML = '<table class="tm-table comparison"><thead><tr><th>Line</th><th class="num">New regime</th><th class="num">Old regime</th></tr></thead><tbody>' +
      rows.map(function (row) {
        var newValue = row[1] === 'rebate87A' ? -c.newRegime[row[1]] : c.newRegime[row[1]];
        var oldValue = row[1] === 'rebate87A' ? -c.oldRegime[row[1]] : c.oldRegime[row[1]];
        var cls = row[1] === 'totalTax' || row[1] === 'totalIncome' ? ' class="strong-row"' : '';
        return '<tr' + cls + '><td>' + esc(row[0]) + '</td><td class="num">' + inr(newValue, 0) + '</td><td class="num">' + inr(oldValue, 0) + '</td></tr>';
      }).join('') + '</tbody></table>';

    var summary = $('comparisonSummary');
    if (summary) {
      summary.className = 'alert ' + (c.recommended === 'either' ? 'warn' : 'warn');
      summary.innerHTML = '<strong>' + esc(c.summary) + '.</strong> ' +
        (c.recommended === 'new'
          ? 'The new regime (115BAC) is the default — you must actively opt out to use the old regime.'
          : c.recommended === 'old'
            ? 'To use the old regime you must opt out of the new regime in the return before the due date.'
            : 'Either regime is acceptable; the new regime is the default.');
    }

    var breakdown = $('slabBreakdown');
    if (breakdown) {
      breakdown.innerHTML = '<table class="tm-table"><thead><tr><th>Slab</th><th class="num">Rate</th><th class="num">Income in slab</th><th class="num">Tax</th></tr></thead><tbody>' +
        chosen.slabBreakdown.map(function (b) {
          return '<tr><td>' + inr(b.from, 0) + ' – ' + (b.to === null ? 'above' : inr(b.to, 0)) + '</td><td class="num">' + b.rate + '%</td>' +
            '<td class="num">' + inr(b.taxable, 0) + '</td><td class="num">' + inr(b.tax, 0) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }

    var special = $('specialBreakdown');
    if (special) {
      special.innerHTML = chosen.specialBreakdown.length
        ? '<table class="tm-table"><thead><tr><th>Head</th><th class="num">Income</th><th class="num">Rate</th><th class="num">Tax</th></tr></thead><tbody>' +
        chosen.specialBreakdown.map(function (b) {
          return '<tr><td>' + esc(b.label) + '</td><td class="num">' + inr(b.income, 0) + '</td><td class="num">' + b.rate + '%</td><td class="num">' + inr(b.tax, 0) + '</td></tr>';
        }).join('') + '</tbody></table>'
        : '<p class="muted-note">No special-rate income entered.</p>';
    }

    var chooseNew = $('chooseNew');
    var chooseOld = $('chooseOld');
    if (chooseNew) chooseNew.classList.toggle('selected', state.chosenRegime === 'new');
    if (chooseOld) chooseOld.classList.toggle('selected', state.chosenRegime === 'old');
  }

  /* ------------------------- step 6: advance tax ------------------------- */
  function renderAdvanceTax() {
    var result = activeResult(compare());
    var schedule = T.advanceTaxSchedule(result.totalTax, state.profile.fy, state.taxes.advanceTaxPaid);
    var host = $('advanceTaxBody');
    if (!host) return;
    if (!schedule.applicable) {
      host.innerHTML = '<p class="muted-note">' + esc(schedule.reason || 'No advance tax is due.') + '</p>';
    } else {
      host.innerHTML = '<table class="tm-table"><thead><tr><th>Instalment</th><th>Due date</th><th class="num">Cumulative %</th><th class="num">Amount due</th></tr></thead><tbody>' +
        schedule.instalments.map(function (i) {
          return '<tr><td>' + esc(i.label) + '</td><td>' + esc(i.dueDate) + '</td><td class="num">' + i.cumulativePercent + '%</td>' +
            '<td class="num">' + inr(i.instalmentAmount, 0) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="muted-note">Total liability ' + inr(schedule.totalTax, 0) + ' · paid so far ' + inr(schedule.paid, 0) +
        ' · balance ' + inr(schedule.balance, 0) + '. Interest u/s 234B/234C applies to shortfalls.</p>';
    }
    setText('taxesTotal', inr(result.totalTax, 0));
    setText('taxesPaidTotal', inr(result.taxesPaid, 0));
    setText('taxesBalance', result.balancePayable >= 0 ? inr(result.balancePayable, 0) : inr(-result.balancePayable, 0) + ' refund');
  }

  /* ------------------------- step 7: review ------------------------- */
  function renderReview() {
    var c = compare();
    var result = activeResult(c);
    var p = state.profile;

    var rec = T.recommendITRForm({
      entityType: p.entityType,
      totalIncome: result.totalIncome,
      presumptive: p.presumptive,
      hasBusinessIncome: p.hasBusinessIncome,
      hasCapitalGains: p.hasCapitalGains || result.specialIncome > 0,
      foreignAssets: p.foreignAssets,
      houseProperties: p.houseProperties,
      residentialStatus: p.residentialStatus,
      directorInCompany: p.directorInCompany,
      unlistedShares: p.unlistedShares
    });
    var meta = T.ITR_FORMS[rec.form] || { name: '', who: '' };

    var host = $('reviewBody');
    if (host) {
      host.innerHTML =
        '<div class="review-grid">' +
        card('Taxpayer', [
          ['Name', p.name || '—'],
          ['PAN', (p.pan || '—').toUpperCase()],
          ['Financial year', p.fy + ' (AY ' + result.assessmentYear + ')'],
          ['Entity type', p.entityType],
          ['Age group', result.ageGroup],
          ['Residential status', p.residentialStatus]
        ]) +
        card('Computation at a glance', [
          ['Gross total income', inr(result.grossTotalIncome, 0)],
          ['Deductions', inr(result.deductionTotal, 0)],
          ['Total income', inr(result.totalIncome, 0)],
          ['Tax before rebate', inr(result.taxBeforeRebate, 0)],
          ['Rebate 87A', '− ' + inr(result.rebate87A, 0)],
          ['Surcharge', inr(result.surcharge, 0)],
          ['Cess', inr(result.cess, 0)],
          ['Total tax', inr(result.totalTax, 0)],
          ['Effective rate', result.effectiveRate + '%']
        ]) +
        card('Settlement', [
          ['TDS / TCS credit', inr(result.tdsPaid, 0)],
          ['Advance / self-assessment tax', inr(result.advanceTaxPaid, 0)],
          [result.refundDue > 0 ? 'Refund due' : 'Balance payable', inr(result.refundDue > 0 ? result.refundDue : result.balancePayable, 0)],
          ['Regime proposed', result.regimeLabel],
          ['Monthly tax outgo', inr(result.monthlyOutgo, 0)]
        ]) +
        '</div>' +
        '<div class="rec-card"><strong>File ' + esc(rec.form) + ' – ' + esc(meta.name) + '</strong>' +
        '<p>' + esc(meta.who) + '</p>' +
        '<ul>' + rec.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' +
        (rec.alternatives.length ? '<p class="muted-note">Alternative: ' + rec.alternatives.map(esc).join(', ') + '</p>' : '') +
        '</div>';
    }

    var warnHost = $('reviewWarnings');
    if (warnHost) {
      var list = warnings(result);
      warnHost.innerHTML = list.length
        ? '<div class="alert warn"><strong>Check before filing:</strong><ul>' + list.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>'
        : '';
    }

    setText('reviewForm', rec.form);
    setText('reviewFormName', meta.name || '');
  }

  function card(title, rows) {
    return '<div class="card-block"><h3>' + esc(title) + '</h3><table class="tm-table"><tbody>' +
      rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td class="num"><strong>' + esc(r[1]) + '</strong></td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  /* ------------------------- draft persistence & export ------------------------- */
  var draftTimer = null;
  function saveDraft() {
    if (!S) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      S.write(S.KEYS.itrDraft, { savedAt: new Date().toISOString(), state: state });
    }, 400);
  }

  function loadDraft() {
    if (!S) return false;
    var draft = S.read(S.KEYS.itrDraft, null);
    if (!draft || !draft.state) return false;
    var saved = draft.state;
    Object.keys(state).forEach(function (key) {
      if (saved[key] !== undefined && key !== 'step') state[key] = saved[key];
    });
    return true;
  }

  function buildExport() {
    var c = compare();
    var result = activeResult(c);
    var p = state.profile;
    var rec = T.recommendITRForm({
      entityType: p.entityType, totalIncome: result.totalIncome, presumptive: p.presumptive,
      hasBusinessIncome: p.hasBusinessIncome, hasCapitalGains: p.hasCapitalGains || result.specialIncome > 0,
      foreignAssets: p.foreignAssets, houseProperties: p.houseProperties,
      residentialStatus: p.residentialStatus, directorInCompany: p.directorInCompany, unlistedShares: p.unlistedShares
    });
    return {
      app: 'TaxMitra',
      document: 'ITR computation working paper',
      generatedAt: new Date().toISOString(),
      disclaimer: 'Working paper only. This file is not a return of income and has not been submitted to the Income Tax Department.',
      formRecommended: rec.form,
      formReasons: rec.reasons,
      profile: state.profile,
      schedules: {
        salary: state.income,
        capitalGains: state.gains,
        deductions: state.deductions,
        taxesPaid: state.taxes
      },
      computation: {
        newRegime: c.newRegime,
        oldRegime: c.oldRegime,
        proposed: result.regime,
        recommended: c.recommended
      },
      warnings: warnings(result)
    };
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportJSON() {
    download('itr-working-paper-' + (state.profile.fy || 'FY') + '.json', JSON.stringify(buildExport(), null, 2), 'application/json');
  }

  function renderLetOut() {
    var host = $('letOutRows');
    if (!host) return;
    host.innerHTML = state.income.letOut.map(function (prop, index) {
      return '<tr>' +
        '<td><input type="number" min="0" data-letout="' + index + '" data-field="annualRent" value="' + num(prop.annualRent) + '" aria-label="Annual rent property ' + (index + 1) + '"></td>' +
        '<td><input type="number" min="0" data-letout="' + index + '" data-field="municipalTaxes" value="' + num(prop.municipalTaxes) + '" aria-label="Municipal taxes property ' + (index + 1) + '"></td>' +
        '<td><input type="number" min="0" data-letout="' + index + '" data-field="homeLoanInterest" value="' + num(prop.homeLoanInterest) + '" aria-label="Interest property ' + (index + 1) + '"></td>' +
        '<td><button type="button" class="btn-icon danger" data-remove-letout="' + index + '">✕</button></td></tr>';
    }).join('') || '<tr><td colspan="4" class="muted-note">No let-out property added.</td></tr>';
  }

  /* ------------------------- events ------------------------- */
  function bindEvents() {
    // One delegated handler for every Continue / Back button in the wizard.
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-next]')) {
        var errors = validateStep(state.step);
        if (errors.length) { showErrors(errors); return; }
        if (state.step < TOTAL_STEPS) {
          state.step += 1;
          visited = Math.max(visited, state.step);
          render();
        }
        return;
      }
      if (e.target.closest('[data-prev]')) {
        if (state.step > 1) { state.step -= 1; render(); }
      }
    });

    var finish = $('finishBtn');
    if (finish) finish.addEventListener('click', function (e) {
      e.preventDefault();
      var errors = validateStep(state.step);
      if (errors.length) { showErrors(errors); return; }
      exportJSON();
    });

    var nav = $('stepNav');
    if (nav) nav.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-goto]');
      if (!btn || btn.disabled) return;
      var target = Number(btn.getAttribute('data-goto'));
      if (target > state.step) {
        // Only allow jumping forward if the current step validates.
        var errors = validateStep(state.step);
        if (errors.length) { showErrors(errors); return; }
      }
      state.step = target;
      render();
    });

    var chooseNew = $('chooseNew');
    if (chooseNew) chooseNew.addEventListener('click', function () { state.chosenRegime = 'new'; renderComparison(); saveDraft(); });
    var chooseOld = $('chooseOld');
    if (chooseOld) chooseOld.addEventListener('click', function () { state.chosenRegime = 'old'; renderComparison(); saveDraft(); });

    var addLetOut = $('addLetOut');
    if (addLetOut) addLetOut.addEventListener('click', function () {
      if (state.income.letOut.length >= 5) return;
      state.income.letOut.push({ annualRent: 0, municipalTaxes: 0, homeLoanInterest: 0 });
      renderLetOut();
      saveDraft();
    });

    var letOutHost = $('letOutRows');
    if (letOutHost) {
      letOutHost.addEventListener('input', function (e) {
        var index = e.target.getAttribute('data-letout');
        var field = e.target.getAttribute('data-field');
        if (index === null || !field) return;
        state.income.letOut[Number(index)][field] = e.target.value === '' ? 0 : Number(e.target.value);
        saveDraft();
      });
      letOutHost.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-remove-letout]');
        if (!btn) return;
        state.income.letOut.splice(Number(btn.getAttribute('data-remove-letout')), 1);
        renderLetOut();
        saveDraft();
      });
    }

    var exportBtn = $('exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportJSON);

    var printBtn = $('printComputation');
    if (printBtn) printBtn.addEventListener('click', function () { if (typeof window.print === 'function') window.print(); });

    var resetBtn = $('resetDraft');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      if (!window.confirm('Clear the saved draft? Your entered figures will be lost.')) return;
      if (S) S.remove(S.KEYS.itrDraft);
      window.location.reload();
    });
  }

  /* ------------------------- boot ------------------------- */
  function init() {
    if (!document.querySelector('[data-bind]')) return; // not on the wizard page
    if (loadDraft()) {
      var notice = $('draftNotice');
      if (notice) notice.hidden = false;
    }
    bindInputs();
    bindEvents();
    renderLetOut();
    updateProfileHint();
    renderFormRecommendation();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.TMITRWizard = {
    state: state,
    compare: compare,
    buildExport: buildExport,
    validateStep: validateStep,
    warnings: warnings
  };
})();
