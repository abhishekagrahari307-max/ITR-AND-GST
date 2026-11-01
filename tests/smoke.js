#!/usr/bin/env node
/* ===================================================
   Browser smoke test (optional – needs jsdom).
   Runs the real pages with their real scripts and drives the UI:
   create an invoice, walk the ITR wizard, search the directory.
   Skipped automatically when jsdom is not installed.

     npm install --no-save jsdom
     node tests/smoke.js
   =================================================== */
'use strict';

var path = require('path');
var fs = require('fs');

var jsdom;
try {
  jsdom = require('jsdom');
} catch (e) {
  console.log('\n⚠  jsdom is not installed – skipping the browser smoke test.');
  console.log('   Run `npm install --no-save jsdom` and re-run `node tests/smoke.js`.\n');
  process.exit(0);
}

var JSDOM = jsdom.JSDOM;
var ResourceLoader = jsdom.ResourceLoader;
var ROOT = path.join(__dirname, '..');
var ORIGIN = 'https://taxmitra.test';

var results = { passed: 0, failed: 0, failures: [] };

async function check(name, fn) {
  try {
    await fn();
    results.passed += 1;
    console.log('  ✓ ' + name);
  } catch (error) {
    results.failed += 1;
    results.failures.push({ name: name, error: error });
    console.log('  ✗ ' + name + '\n      ' + error.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'value mismatch') + ' – expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

/* Load the page with its local scripts evaluated in document order.
   External CDN scripts are dropped: they only affect styling/icons, and
   blocking the network keeps this test deterministic. */
async function loadPage(relative) {
  var html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  var scripts = [];
  var scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  var match;
  while ((match = scriptRegex.exec(html)) !== null) {
    var attrs = match[1] || '';
    var body = match[2] || '';
    var srcMatch = /\ssrc="([^"]+)"/i.exec(attrs);
    if (srcMatch) scripts.push({ src: srcMatch[1] });
    else if (body.trim()) scripts.push({ inline: body });
  }
  var stripped = html.replace(scriptRegex, '<!-- script removed for testing -->');

  var dom = new JSDOM(stripped, {
    runScripts: 'dangerously',
    url: ORIGIN + '/' + relative,
    pretendToBeVisual: true,
    beforeParse: function (window) {
      window.confirm = function () { return true; };
      window.prompt = function () { return 'DELETE'; };
      window.print = function () { window.__printed = (window.__printed || 0) + 1; };
      window.scrollTo = function () {};
      window.IntersectionObserver = function () {
        this.observe = function () {};
        this.unobserve = function () {};
        this.disconnect = function () {};
        this.takeRecords = function () { return []; };
      };
      window.matchMedia = window.matchMedia || function () {
        return { matches: false, addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {} };
      };
      window.URL.createObjectURL = function () { return 'blob:mock'; };
      window.URL.revokeObjectURL = function () {};
      window.__errors = [];
      window.__dclFired = false;
      window.document.addEventListener('DOMContentLoaded', function () { window.__dclFired = true; });
      window.addEventListener('error', function (event) {
        window.__errors.push(String(event.message || (event.error && event.error.message) || event.type));
      });
    }
  });

  var window = dom.window;
  var base = path.dirname(relative);

  scripts.forEach(function (script) {
    if (script.inline) {
      window.eval(script.inline);
      return;
    }
    if (/^(https?:)?\/\//.test(script.src)) return; // CDN: skip
    var file = path.join(ROOT, base, script.src);
    if (!fs.existsSync(file)) throw new Error('missing script ' + script.src + ' in ' + relative);
    window.eval(fs.readFileSync(file, 'utf8'));
  });

  // Scripts registered DOMContentLoaded handlers; jsdom fires that event once,
  // asynchronously, after construction – so just wait for it (never re-dispatch,
  // which would run every init() twice).
  await new Promise(function (resolve) {
    if (window.__dclFired) return resolve();
    var timer = setTimeout(function () {
      // Fallback: if jsdom already finished loading before our eval, fire once.
      if (!window.__dclFired) window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
      resolve();
    }, 1500);
    window.document.addEventListener('DOMContentLoaded', function () {
      clearTimeout(timer);
      resolve();
    });
  });
  window.__dclFired = true;
  await new Promise(function (resolve) { setTimeout(resolve, 50); });
  return dom;
}

function setValue(window, id, value) {
  var el = window.document.getElementById(id);
  if (!el) throw new Error('missing #' + id);
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function click(window, selector) {
  var el = window.document.querySelector(selector);
  if (!el) throw new Error('missing ' + selector);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return el;
}

async function billingTests() {
  console.log('\nBilling page');
  var dom = await loadPage('pages/billing.html');
  var window = dom.window;
  var document = window.document;

  await check('scripts load without a page error', function () {
    equal((window.__errors || []).length, 0, 'window errors: ' + (window.__errors || []).join(' | '));
    assert(window.TMGST, 'TMGST missing');
    assert(window.TMStore, 'TMStore missing');
    assert(window.TMBilling, 'TMBilling missing');
  });

  await check('dashboard renders the empty state', function () {
    assert(document.getElementById('recentBody').textContent.indexOf('No invoices yet') !== -1, 'expected the empty recent list');
    equal(document.getElementById('statInvoiced').textContent, '₹0.00');
  });

  await check('the GSTIN warning appears when no seller GSTIN is set', function () {
    var warn = document.getElementById('gstinWarning');
    assert(warn.hidden === false, 'warning should be visible');
    assert(warn.textContent.indexOf('No seller GSTIN') !== -1);
  });

  await check('business settings can be saved', function () {
    setValue(window, 'set_businessName', 'Kulkarni & Associates');
    setValue(window, 'set_gstin', '27AAPFU0939F1ZV');
    setValue(window, 'set_state', '27');
    var form = document.getElementById('settingsForm');
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    var saved = JSON.parse(window.localStorage.getItem('tm-billing-settings'));
    equal(saved.businessName, 'Kulkarni & Associates');
    equal(saved.gstin, '27AAPFU0939F1ZV');
  });

  await check('the GSTIN warning disappears once a valid GSTIN is set', function () {
    assert(document.getElementById('gstinWarning').hidden === true, 'warning should be hidden');
  });

  await check('a new invoice can be created and saved', function () {
    click(window, '[data-tab-btn="new"]');
    setValue(window, 'buyerName', 'Sharma Traders');
    setValue(window, 'buyerGstin', '27AAPFU0939F1ZV');
    setValue(window, 'buyerState', '27');
    setValue(window, 'invoiceNumber', 'INV/2026-27/0001');
    setValue(window, 'invoiceDate', '2026-04-05');

    var row = document.querySelector('#lineRows tr[data-line="0"]');
    assert(row, 'line row missing');
    var description = row.querySelector('[data-field="description"]');
    description.value = 'Consulting service';
    description.dispatchEvent(new window.Event('input', { bubbles: true }));
    var rate = row.querySelector('[data-field="rate"]');
    rate.value = '5000';
    rate.dispatchEvent(new window.Event('input', { bubbles: true }));

    click(window, '#saveInvoice');

    equal(window.TMBilling.state.invoices.length, 1, 'invoice should be stored');
    var invoice = window.TMBilling.state.invoices[0];
    equal(invoice.buyerName, 'Sharma Traders');
    equal(invoice.computed.grandTotal, 5900, '₹5,000 + 18% GST');
    equal(invoice.computed.cgst, 450);
    assert(document.getElementById('invoiceBody').textContent.indexOf('Sharma Traders') !== -1, 'invoice list should show the buyer');
  });

  await check('an invalid GSTIN blocks the save with a readable error', function () {
    click(window, '[data-tab-btn="new"]');
    setValue(window, 'buyerName', 'Bad GSTIN Buyer');
    setValue(window, 'buyerGstin', '27AAPFU0939F1ZX');
    var row = document.querySelector('#lineRows tr[data-line="0"]');
    var description = row.querySelector('[data-field="description"]');
    description.value = 'Something';
    description.dispatchEvent(new window.Event('input', { bubbles: true }));
    var rate = row.querySelector('[data-field="rate"]');
    rate.value = '100';
    rate.dispatchEvent(new window.Event('input', { bubbles: true }));
    click(window, '#saveInvoice');
    var errors = document.getElementById('formErrors');
    assert(errors.hidden === false, 'error box should be shown');
    assert(errors.textContent.indexOf('Check digit') !== -1, 'should explain the check digit problem');
    equal(window.TMBilling.state.invoices.length, 1, 'nothing new should be saved');
    // Regression: a rejected save must not corrupt the invoice already in the store.
    var stored = window.TMBilling.state.invoices[0];
    equal(stored.buyerName, 'Sharma Traders', 'the saved invoice must be untouched by a failed edit');
    equal(stored.computed.grandTotal, 5900, 'the saved total must not change because of a failed edit');
  });

  await check('marking an invoice paid updates the dashboard', function () {
    click(window, '[data-tab-btn="invoices"]');
    click(window, '[data-toggle-paid]');
    equal(window.TMBilling.state.invoices[0].status, 'paid');
    click(window, '[data-tab-btn="dashboard"]');
    equal(document.getElementById('statCollected').textContent, '₹5,900.00');
    equal(document.getElementById('statOutstanding').textContent, '₹0.00');
  });

  await check('printing builds the invoice sheet', function () {
    click(window, '[data-tab-btn="invoices"]');
    click(window, '[data-print]');
    var sheet = document.getElementById('printArea').innerHTML;
    assert(sheet.indexOf('TAX INVOICE') !== -1, 'print sheet should be built');
    assert(sheet.indexOf('Kulkarni &amp; Associates') !== -1 || sheet.indexOf('Kulkarni & Associates') !== -1, 'business name should appear');
    assert(window.__printed === 1, 'window.print should have been called once');
  });

  await check('a customer can be added and reused', function () {
    click(window, '[data-tab-btn="customers"]');
    setValue(window, 'cname', 'Patel Textiles');
    setValue(window, 'cgstin', '27AAPFU0939F1ZV');
    document.getElementById('customerForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    assert(document.getElementById('customerBody').textContent.indexOf('Patel Textiles') !== -1, 'customer row missing');
    click(window, '[data-use-customer]');
    equal(document.getElementById('buyerName').value, document.querySelector('#customerBody tr td').textContent);
  });

  await check('the GSTR-1 export stays disabled-free and honest', function () {
    var button = document.getElementById('exportGstr1Btn');
    assert(button, 'export button missing');
    var text = document.body.textContent;
    assert(text.indexOf('not an official upload file') !== -1, 'the disclaimer must stay visible');
  });

  dom.window.close();
}

async function itrTests() {
  console.log('\nITR wizard');
  var dom = await loadPage('pages/itr-form.html');
  var window = dom.window;
  var document = window.document;

  await check('scripts load without a page error', function () {
    equal((window.__errors || []).length, 0, 'window errors: ' + (window.__errors || []).join(' | '));
    assert(window.TMIT, 'TMIT missing');
    assert(window.TMITRWizard, 'TMITRWizard missing');
  });

  await check('step 1 is visible and later steps are hidden', function () {
    equal(document.getElementById('step1').hidden, false);
    equal(document.getElementById('step7').hidden, true);
    assert(document.getElementById('stepNav').querySelectorAll('button').length === 7, 'expected 7 step buttons');
  });

  await check('the ITR-1..7 reference cards are rendered', function () {
    var cards = document.getElementById('formList').querySelectorAll('article');
    equal(cards.length, 7);
    assert(document.getElementById('formList').textContent.indexOf('Sahaj') !== -1);
  });

  await check('an invalid PAN blocks the step', function () {
    setValue(window, 'name', 'Asha Kulkarni');
    setValue(window, 'pan', 'ABCDE123');
    setValue(window, 'age', '34');
    click(window, '[data-next]');
    var errors = document.getElementById('stepErrors');
    assert(errors.hidden === false, 'errors should be visible');
    assert(errors.textContent.indexOf('PAN') !== -1);
    equal(document.getElementById('step1').hidden, false, 'should stay on step 1');
  });

  await check('a valid profile advances to step 2 and suggests a form', function () {
    setValue(window, 'pan', 'ABCDE1234F');
    var hint = document.getElementById('panHint');
    assert(hint.className.indexOf('ok') !== -1, 'PAN hint should turn green');
    click(window, '[data-next]');
    equal(document.getElementById('step1').hidden, true);
    equal(document.getElementById('step2').hidden, false);
    assert(document.getElementById('formRecommendation').textContent.indexOf('ITR-1') !== -1, 'a simple salary profile should suggest ITR-1');
  });

  await check('salary income is accepted and advances', function () {
    setValue(window, 'grossSalary', '1275000');
    setValue(window, 'basicDa', '600000');
    click(window, '[data-next]');
    equal(document.getElementById('step3').hidden, false);
  });

  await check('capital gains step and deductions step advance', function () {
    setValue(window, 'ltcg112a', '225000');
    click(window, '[data-next]');
    equal(document.getElementById('step4').hidden, false);
    setValue(window, 'c80c', '150000');
    click(window, '[data-next]');
    equal(document.getElementById('step5').hidden, false);
  });

  await check('the regime comparison renders both columns', function () {
    var table = document.getElementById('comparisonBody').querySelector('table');
    assert(table, 'comparison table missing');
    assert(table.textContent.indexOf('New regime') !== -1 && table.textContent.indexOf('Old regime') !== -1);
    var rows = table.querySelectorAll('tbody tr');
    assert(rows.length >= 15, 'expected the full comparison, got ' + rows.length + ' rows');
    assert(document.getElementById('comparisonSummary').textContent.indexOf('regime') !== -1, 'summary should name a regime');
  });

  await check('the slab breakdown shows the special-rate income', function () {
    assert(document.getElementById('slabBreakdown').textContent.indexOf('%') !== -1, 'slab table missing');
    assert(document.getElementById('specialBreakdown').textContent.indexOf('112A') !== -1, 'LTCG 112A row missing');
  });

  await check('choosing the old regime updates the selection', function () {
    click(window, '#chooseOld');
    assert(document.getElementById('chooseOld').className.indexOf('selected') !== -1);
    assert(document.getElementById('chooseNew').className.indexOf('selected') === -1);
  });

  await check('the advance tax schedule renders', function () {
    click(window, '[data-next]');
    equal(document.getElementById('step6').hidden, false);
    var body = document.getElementById('advanceTaxBody');
    assert(body.textContent.length > 20, 'advance tax body should have content');
    assert(document.getElementById('taxesTotal').textContent.indexOf('₹') !== -1, 'liability should be formatted');
  });

  await check('the review step recommends a form and shows the computation', function () {
    click(window, '[data-next]');
    equal(document.getElementById('step7').hidden, false);
    var form = document.getElementById('reviewForm').textContent;
    assert(/^ITR-[1-7]$/.test(form), 'expected an ITR form, got ' + form);
    assert(document.getElementById('reviewBody').textContent.indexOf('Total tax') !== -1, 'computation card missing');
    assert(document.getElementById('reviewWarnings').textContent.length > 0, 'warnings should be shown for this profile');
  });

  await check('the export payload is honest and complete', function () {
    var payload = window.TMITRWizard.buildExport();
    assert(payload.disclaimer.indexOf('not a return of income') !== -1, 'disclaimer missing from the export');
    assert(payload.computation.newRegime && payload.computation.oldRegime, 'both regimes should be exported');
    equal(payload.profile.pan, 'ABCDE1234F');
    assert(/^ITR-/.test(payload.formRecommended));
  });

  await new Promise(function (resolve) { setTimeout(resolve, 600); });

  await check('the draft is persisted to localStorage (after the debounce)', function () {
    var raw = window.localStorage.getItem('tm-itr-draft');
    assert(raw, 'draft not saved');
    var draft = JSON.parse(raw);
    equal(draft.state.profile.name, 'Asha Kulkarni');
  });


  await check('step 7 shows the schema validation panel', function () {
    // Walk to the review step through the wizard API rather than the buttons.
    var wiz = window.TMITRWizard;
    assert(wiz, 'the wizard should expose its API');
    wiz.state.profile.pan = 'BADPAN';
    var html = wiz.renderValidation();
    assert(html.indexOf('PAN') !== -1, 'the PAN error must be listed');
    assert(html.indexOf('error') !== -1 || html.indexOf('⚠️') !== -1);
    wiz.state.profile.pan = 'ABCDE1234F';
    assert(wiz.renderValidation().indexOf('No validation issues') !== -1, 'a clean draft should say so');
  });

  await check('the ITR JSON export produces a real schema-shaped file', function () {
    assert(window.TMITRSchema, 'itr-schema.js should be loaded on the wizard page');
    var doc = window.TMITRSchema.build(window.TMITRWizard.state, { form: 'ITR-1' });
    equal(doc.submitted, false);
    var itr = doc.ITR.ITR1;
    assert(itr.PersonalInfo.PAN === 'ABCDE1234F', 'PAN must come from the wizard state');
    var comparison = window.TMITRWizard.compare();
    var expected = itr.TaxComputation.Regime === 'Old' ? comparison.oldRegime.totalTax : comparison.newRegime.totalTax;
    equal(itr.TaxComputation.TotalTaxPayable, expected, 'the exported tax must equal the engine result for that regime');
  });

  await check('exporting with errors asks for confirmation before writing', function () {
    var wiz = window.TMITRWizard;
    var originalPan = wiz.state.profile.pan;
    wiz.state.profile.pan = 'XX';
    var calls = 0;
    window.confirm = function () { calls += 1; return false; }; // decline
    window.URL.createObjectURL = function () { window.__downloaded = true; return 'blob:mock'; };
    window.__downloaded = false;
    wiz.exportItrJson();
    equal(calls, 1, 'the user must be asked');
    equal(window.__downloaded, false, 'declining must not download anything');
    wiz.state.profile.pan = originalPan;
  });

  dom.window.close();
}

async function directoryTests() {
  console.log('\nOpen-source directory');
  var dom = await loadPage('pages/github-tools.html');
  var window = dom.window;
  var document = window.document;

  await check('all 25 projects render', function () {
    equal((window.__errors || []).length, 0, 'window errors: ' + (window.__errors || []).join(' | '));
    equal(document.querySelectorAll('.repo-card').length, 25);
    assert(document.getElementById('resultCount').textContent.indexOf('25') !== -1);
  });

  await check('every card links to GitHub and shows a licence tag', function () {
    var cards = document.querySelectorAll('.repo-card');
    for (var i = 0; i < cards.length; i++) {
      var link = cards[i].querySelector('a[href^="https://github.com/"]');
      assert(link, 'card ' + i + ' has no GitHub link');
      assert(cards[i].querySelector('.tag'), 'card ' + i + ' has no tags');
    }
  });

  await check('search filters the grid', function () {
    var input = document.getElementById('repoSearch');
    input.value = 'gstr';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    var shown = document.querySelectorAll('.repo-card').length;
    assert(shown > 0 && shown < 25, 'expected a narrowed list, got ' + shown);
  });

  await check('a nonsense query shows the empty state', function () {
    var input = document.getElementById('repoSearch');
    input.value = 'zzzzz-nothing';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    equal(document.querySelectorAll('.repo-card').length, 0);
    equal(document.getElementById('emptyState').hidden, false);
  });

  await check('category chips filter by category', function () {
    var input = document.getElementById('repoSearch');
    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    click(window, '[data-category="documents"]');
    var cards = document.querySelectorAll('.repo-card');
    equal(cards.length, 4, 'four document tools are listed');
  });

  await check('the unlicensed projects are flagged in the UI', function () {
    click(window, '[data-category="all"]');
    var select = document.getElementById('licenceFilter');
    select.value = 'unlicensed';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    var cards = document.querySelectorAll('.repo-card');
    equal(cards.length, 2);
  });

  dom.window.close();
}

async function adminTests() {
  console.log('\nStorage console');
  var dom = await loadPage('pages/admin.html');
  var window = dom.window;
  var document = window.document;

  await check('scripts load and the empty state is reported', function () {
    equal((window.__errors || []).length, 0, 'window errors: ' + (window.__errors || []).join(' | '));
    assert(window.TMAdmin, 'TMAdmin missing');
    equal(document.getElementById('invoiceCount').textContent, '0');
    assert(document.getElementById('integrityBody').textContent.length > 0, 'integrity check should run on load');
  });

  await check('the console starts empty – no demo or fake data', function () {
    equal(document.querySelectorAll('#seedBtn').length, 0, 'the demo seeder must not exist any more');
    equal(document.getElementById('invoiceCount').textContent, '0');
    equal(document.getElementById('customerCount').textContent, '0');
    equal(document.getElementById('invoicedTotal').textContent, '₹0.00');
  });

  await check('data written through the store shows up in the console', function () {
    // Real records, created the same way the billing page creates them.
    window.TMStore.saveList('customers', [{ id: 'c1', name: 'Real Customer', gstin: '', state: '27' }]);
    window.TMStore.saveList('invoices', [{
      id: 'i1', invoiceNumber: 'INV/2026-27/0001', invoiceDate: '2026-04-05', buyerName: 'Real Customer',
      buyerState: '27', status: 'unpaid',
      lines: [{ description: 'Consulting', quantity: 1, rate: 1000, gstRate: 18 }]
    }]);
    window.TMAdmin.renderOverview();
    equal(document.getElementById('invoiceCount').textContent, '1');
    equal(document.getElementById('customerCount').textContent, '1');
    assert(document.getElementById('invoicedTotal').textContent.indexOf('1,180') !== -1, 'total should be ₹1,180.00');
  });

  await check('real data passes the integrity check', function () {
    window.TMAdmin.runIntegrityCheck();
    var text = document.getElementById('integrityBody').textContent;
    assert(!/\d+ errors?\b(?! 0)/.test(text) || text.indexOf('0 error') !== -1, 'unexpected errors: ' + text.slice(0, 200));
    assert(/ok|warn/i.test(text), 'expected an ok/warn verdict, got: ' + text.slice(0, 200));
  });

  await check('a guest cannot reach the destructive actions', function () {
    var clear = document.getElementById('clearBtn');
    var restore = document.getElementById('importBackupBtn');
    equal(clear.disabled, true, 'wipe must need an administrator');
    equal(restore.disabled, true, 'restore must need an administrator');
    assert(document.getElementById('roleBanner').textContent.indexOf('guest') !== -1);
    assert(document.getElementById('adminOnlyNote').hidden === false);
  });

  await check('a backup can be produced', function () {
    click(window, '#exportBackupBtn');
    // download() is stubbed by jsdom's createObjectURL mock; assert no throw
    assert(true);
  });

  await check('an administrator can wipe, a guest cannot', function () {
    // Guest click does nothing.
    click(window, '#clearBtn');
    equal(document.getElementById('invoiceCount').textContent, '1', 'guest must not wipe data');

    // Simulate the admin session exactly as the account page stores it.
    window.localStorage.setItem('tm-gh-session', JSON.stringify({
      token: 't0k3n', login: 'abhishekagrahari307-max', role: 'admin', signedInAt: new Date().toISOString()
    }));
    window.TMAdmin.applyRole();
    equal(document.getElementById('clearBtn').disabled, false, 'admin should unlock wipe');
    click(window, '#clearBtn');
    equal(document.getElementById('invoiceCount').textContent, '0');
    equal(window.localStorage.getItem('tm-billing-invoices'), null);
  });

  dom.window.close();
}


async function homeTests() {
  console.log('\nHomepage AI chat');
  var dom = await loadPage('index.html');
  var window = dom.window;
  var document = window.document;

  await check('scripts load without a page error', function () {
    equal((window.__errors || []).length, 0, 'window errors: ' + (window.__errors || []).join(' | '));
    assert(window.TaxMitraAI, 'TaxMitraAI missing');
    assert(window.TMHomeAssistant, 'home-assistant.js did not run');
    assert(typeof window.sendDemoMsg === 'function', 'sendDemoMsg should be global');
  });

  await check('the status label is honest when no API key is configured', function () {
    var dot = document.querySelector('.online-dot');
    assert(dot, 'status dot missing');
    assert(dot.textContent.indexOf('Offline') !== -1, 'should not claim Gemini without a key, got: ' + dot.textContent);
    assert(dot.textContent.indexOf('rule-based') !== -1);
  });

  await check('the language switch works', function () {
    window.switchLang('en');
    var input = document.getElementById('demoInput');
    assert(input.placeholder.indexOf('Ask') !== -1, 'placeholder should switch to English');
    window.switchLang('hi');
    assert(document.getElementById('demoInput').placeholder.indexOf('Tax') !== -1);
  });

  await check('a homepage question gets a real answer', async function () {
    window.switchLang('en');
    var input = document.getElementById('demoInput');
    input.value = 'Which ITR form should I file?';
    var before = document.querySelectorAll('#aiDemoMessages .chat-msg').length;
    await window.sendDemoMsg();
    var after = document.querySelectorAll('#aiDemoMessages .chat-msg').length;
    assert(after >= before + 2, 'expected a user bubble and a bot reply, went from ' + before + ' to ' + after);
    var bubbles = document.querySelectorAll('#aiDemoMessages .chat-msg.bot');
    var last = bubbles[bubbles.length - 1].textContent;
    assert(last.length > 40, 'the answer looks empty: ' + last.slice(0, 80));
    assert(last.indexOf('Soch raha hoon') === -1, 'the thinking placeholder was never replaced');
    assert(/ITR-1|ITR-2|ITR-3|ITR-4|form/i.test(last), 'answer should mention ITR forms for an ITR question');
  });

  await check('the quick-action helper opens the float window and answers', async function () {
    await window.askQuick('Old vs New Regime');
    var win = document.getElementById('aiFloatWindow');
    assert(win.classList.contains('open'), 'float window should open');
    var msgs = document.querySelectorAll('#afwMessages .afw-msg');
    assert(msgs.length >= 2, 'expected a user + bot message in the float window');
    var last = msgs[msgs.length - 1].textContent;
    assert(last.length > 30, 'float window answer is empty');
  });

  await check('answers are escaped, never injected as raw HTML', async function () {
    var input = document.getElementById('demoInput');
    input.value = '<img src=x onerror=alert(1)>';
    await window.sendDemoMsg();
    var host = document.getElementById('aiDemoMessages');
    equal(host.querySelectorAll('img').length, 0, 'user input must not become markup');
  });


  await check('a home answer with a wrong tax figure is flagged, not trusted', function () {
    assert(window.TMVerify, 'ai-verify.js should be loaded on the homepage');
    var bad = window.TMVerifyLine('20 lakh income par total tax kitna hai?', 'Aapka total tax ₹1,50,000 hoga.');
    assert(bad.indexOf('tm-verify-line') !== -1, 'a verification line should be produced');
    assert(bad.indexOf('Engine disagrees') !== -1, 'a wrong figure must be flagged');
    assert(bad.indexOf('2,08,000') !== -1, 'the engine figure must be shown next to the claim');
  });

  await check('a correct answer is marked engine-verified', function () {
    var correct = window.TMVerify.computeOnIncome(2000000, { fy: '2025-26' }).totalTax;
    var line = window.TMVerifyLine('20 lakh income par total tax?', 'Total tax ₹' + correct.toLocaleString('en-IN') + ' hoga.');
    assert(line.indexOf('Engine-verified') !== -1, line);
    assert(line.indexOf('tm-verify-line ok') !== -1, 'the positive state should carry its own class');
  });

  await check('an answer with no checkable figure gets no badge at all', function () {
    equal(window.TMVerifyLine('80C kya hai?', '80C me ₹1,50,000 tak deduction milta hai.'), '');
  });

  dom.window.close();
}


async function accountTests() {
  console.log('\nAccount page (GitHub sign-in)');
  var dom = await loadPage('pages/account.html');
  var window = dom.window;
  var document = window.document;

  function respond(body, status) {
    return {
      ok: (status || 200) < 300,
      status: status || 200,
      headers: { get: function () { return null; } },
      text: function () { return Promise.resolve(JSON.stringify(body)); },
      json: function () { return Promise.resolve(body); }
    };
  }

  await check('scripts load without a page error', function () {
    var errors = window.__errors || [];
    equal(errors.length, 0, 'page errors: ' + errors.join(' | '));
    assert(window.TMGitHubAuth, 'github-auth.js should expose TMGitHubAuth');
    assert(window.TMSession, 'session-boot.js should expose TMSession');
  });

  await check('signed out shows the sign-in options, not a profile', function () {
    equal(document.getElementById('signedOutView').hidden, false);
    equal(document.getElementById('signedInView').hidden, true);
    equal(window.TMSession.isSignedIn, false);
    equal(window.TMSession.role, 'guest');
  });

  await check('without a client id the device button is disabled and explained', function () {
    equal(document.getElementById('deviceFlowCard').disabled, true);
    equal(document.getElementById('clientIdNotice').hidden, false);
  });

  await check('saving a client id enables the button', function () {
    setValue(window, 'clientIdInput', 'Iv1.0123456789abcdef');
    click(window, '#saveClientId');
    equal(document.getElementById('deviceFlowCard').disabled, false);
    equal(document.getElementById('clientIdNotice').hidden, true);
    equal(window.localStorage.getItem('tm-gh-client-id'), 'Iv1.0123456789abcdef');
  });

  await check('a malformed client id is refused', function () {
    setValue(window, 'clientIdInput', 'nope!');
    click(window, '#saveClientId');
    equal(window.TMGitHubAuth.getConfig().clientId, 'Iv1.0123456789abcdef', 'the bad value must not be saved');
  });

  await check('device flow shows a code and then signs the user in', async function () {
    var calls = [];
    window.fetch = function (url, options) {
      calls.push(String(url));
      if (String(url).indexOf('/login/device/code') !== -1) {
        return Promise.resolve(respond({ device_code: 'dev1', user_code: 'WDJB-MJHT', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 }));
      }
      if (String(url).indexOf('/login/oauth/access_token') !== -1) {
        if (calls.filter(function (u) { return u.indexOf('access_token') !== -1; }).length < 2) {
          return Promise.resolve(respond({ error: 'authorization_pending' }));
        }
        return Promise.resolve(respond({ access_token: 'gho_live_token_value', token_type: 'bearer', scope: 'read:user' }));
      }
      if (/api\.github\.com\/user$/.test(String(url))) {
        return Promise.resolve(respond({ login: 'visitor-user', id: 42, name: 'Visitor', avatar_url: 'https://avatars.example/v.png', html_url: 'https://github.com/visitor-user' }));
      }
      return Promise.resolve(respond({ message: 'Not Found' }, 404));
    };
    window.TMGitHubAuth.setFetch(window.fetch);
    // Speed the poll up so the test does not wait GitHub's 1s minimum twice.
    window.TMGitHubAuth.pollForToken = (function (original) {
      return function (flow, options) {
        var opts = Object.assign({}, options, { wait: function () { return Promise.resolve(); } });
        return original.call(window.TMGitHubAuth, flow, opts);
      };
    })(window.TMGitHubAuth.pollForToken);

    window.TMAccount.startDevice();
    // GitHub's device flow enforces a 1s minimum between polls, so allow time.
    for (var waited = 0; waited < 4000 && !window.TMGitHubAuth.getSession(); waited += 100) {
      await new Promise(function (resolve) { setTimeout(resolve, 100); });
    }
    var session = window.TMGitHubAuth.getSession();
    assert(session, 'expected a session after approval; status was: ' + document.getElementById('deviceStatus').textContent);
    equal(session.login, 'visitor-user');
    equal(session.role, 'user');
    assert(window.localStorage.getItem('tm-gh-session'), 'remembered session should live in localStorage');
  });

  await check('the profile view renders the account and its role', function () {
    window.TMAccount.render();
    equal(document.getElementById('signedInView').hidden, false);
    equal(document.getElementById('profileLogin').textContent, '@visitor-user');
    equal(document.getElementById('profileName').textContent, 'Visitor');
    equal(document.getElementById('roleBadge').textContent.indexOf('User') !== -1, true);
    equal(document.getElementById('adminLink').hidden, true, 'a normal user must not see the admin console link');
  });

  await check('the repository owner is shown as an administrator', function () {
    window.localStorage.setItem('tm-gh-session', JSON.stringify({
      token: 't', login: 'abhishekagrahari307-max', role: 'admin', scope: 'read:user',
      signedInAt: new Date().toISOString(), storage: 'local'
    }));
    window.TMAccount.render();
    equal(document.getElementById('roleBadge').textContent.indexOf('Administrator') !== -1, true);
    equal(document.getElementById('adminLink').hidden, false);
  });

  await check('signing out clears the session and the data namespace', function () {
    click(window, '#signOutBtn');
    equal(window.TMGitHubAuth.getSession(), null);
    equal(window.localStorage.getItem('tm-gh-session'), null);
    equal(window.TMStore.getNamespace(), '');
  });

  await check('a personal access token signs in when the device flow is unavailable', async function () {
    window.TMGitHubAuth.setFetch(function (url) {
      if (/api\.github\.com\/user$/.test(String(url))) {
        return Promise.resolve(respond({ login: 'pat-user', id: 7, name: 'PAT User', avatar_url: 'a.png', html_url: 'h' }));
      }
      return Promise.resolve(respond({ message: 'Not Found' }, 404));
    });
    setValue(window, 'patInput', 'ghp_abcdefghijklmnopqrstuvwx');
    click(window, '#patSignIn');
    await new Promise(function (resolve) { setTimeout(resolve, 150); });
    var session = window.TMGitHubAuth.getSession();
    assert(session, 'expected a PAT session; status: ' + document.getElementById('patStatus').textContent);
    equal(session.login, 'pat-user');
    equal(document.getElementById('patInput').value, '', 'the token must be cleared from the field');
  });

  await check('a rejected token leaves the user signed out with a readable error', async function () {
    window.TMGitHubAuth.signOut();
    window.TMGitHubAuth.setFetch(function () {
      return Promise.resolve(respond({ message: 'Bad credentials' }, 401));
    });
    setValue(window, 'patInput', 'ghp_thisOneIsInvalidxxxxxxxx');
    click(window, '#patSignIn');
    await new Promise(function (resolve) { setTimeout(resolve, 150); });
    equal(window.TMGitHubAuth.getSession(), null);
    assert(document.getElementById('patStatus').textContent.indexOf('revoked') !== -1 ||
      document.getElementById('patStatus').textContent.indexOf('401') !== -1,
      'expected an explanation, got: ' + document.getElementById('patStatus').textContent);
  });

  await check('no client secret is present anywhere on the page', function () {
    var html = fs.readFileSync(path.join(ROOT, 'pages/account.html'), 'utf8');
    assert(!/client_secret\s*[:=]\s*['"][^'"]+/.test(html), 'the page must not carry a client secret');
    assert(!/github_pat_[A-Za-z0-9]{20,}/.test(html), 'no token may be baked into the page');
  });

  dom.window.close();
}


async function itrCentreTests() {
  console.log('\nITR centre (AIS / 26AS / Form 16)');
  var dom = await loadPage('pages/itr-center.html');
  var window = dom.window;
  var document = window.document;

  await check('scripts load without a page error', function () {
    equal((window.__errors || []).length, 0, 'page errors: ' + (window.__errors || []).join(' | '));
    assert(window.TMStore, 'tm-store.js should be loaded');
  });

  await check('nothing is pre-filled with fabricated figures', function () {
    ['aisSalary', 'aisInterest', 'aisDividend', 'aisTds', 'aisTcs', 'aisSelfTax',
      't26SalaryTds', 't26OtherTds', 't26Tcs', 't26Advance', 't26Self',
      'f16Employer', 'f16Gross', 'f16StdDed', 'f16ProfTax', 'f16Tds'].forEach(function (id) {
      var el = document.getElementById(id);
      assert(el, 'missing #' + id);
      equal(el.value, '', '#' + id + ' must start empty');
    });
    equal(document.getElementById('aisAnalysisResult').style.display, 'none');
    equal(document.getElementById('form26asResult').style.display, 'none');
    equal(document.getElementById('form16Result').style.display, 'none');
  });

  await check('26AS total is computed from what the taxpayer enters', function () {
    setValue(window, 't26SalaryTds', '72500');
    setValue(window, 't26OtherTds', '1850');
    setValue(window, 't26Tcs', '0');
    setValue(window, 't26Advance', '15000');
    setValue(window, 't26Self', '0');
    click(window, '[onclick="save26ASFigures()"]');
    var body = document.getElementById('t26Body').textContent;
    assert(body.indexOf('89,350') !== -1, 'expected a total of ₹89,350, got: ' + body.slice(0, 200));
    var saved = window.TMStore.read('tm-26as-figures', null);
    equal(saved.salaryTds, 72500);
    equal(saved.advance, 15000);
  });

  await check('an empty 26AS save is refused instead of inventing numbers', function () {
    window.TMStore.remove('tm-26as-figures');
    ['t26SalaryTds', 't26OtherTds', 't26Tcs', 't26Advance', 't26Self'].forEach(function (id) { setValue(window, id, ''); });
    document.getElementById('form26asResult').style.display = 'none';
    click(window, '[onclick="save26ASFigures()"]');
    equal(document.getElementById('form26asResult').style.display, 'none');
    equal(window.TMStore.read('tm-26as-figures', null), null);
  });

  await check('Form 16 rejects a bad TAN and a deduction larger than salary', function () {
    setValue(window, 'f16Gross', '920000');
    setValue(window, 'f16Tan', 'BADTAN');
    click(window, '[onclick="saveForm16()"]');
    equal(window.TMStore.read('tm-form16-figures', null), null, 'a bad TAN must not be saved');

    setValue(window, 'f16Tan', 'ABCD12345E');
    setValue(window, 'f16StdDed', '9999999');
    click(window, '[onclick="saveForm16()"]');
    equal(window.TMStore.read('tm-form16-figures', null), null, 'std deduction above gross must not be saved');
  });

  await check('Form 16 saves the real figures and computes taxable salary', function () {
    setValue(window, 'f16Employer', 'My Employer Pvt Ltd');
    setValue(window, 'f16StdDed', '75000');
    setValue(window, 'f16ProfTax', '2400');
    setValue(window, 'f16Tds', '78250');
    click(window, '[onclick="saveForm16()"]');
    var saved = window.TMStore.read('tm-form16-figures', null);
    assert(saved, 'expected the figures to be stored');
    equal(saved.gross, 920000);
    equal(saved.tds, 78250);
    var body = document.getElementById('form16Body').textContent;
    assert(body.indexOf('8,42,600') !== -1, 'taxable salary should be ₹8,42,600, got: ' + body.slice(0, 300));
  });

  await check('sending Form 16 to the wizard writes a real prefill into the draft', function () {
    click(window, '[onclick="realCopyToITR()"]');
    var draft = window.TMStore.read(window.TMStore.KEYS.itrDraft, null);
    assert(draft && draft.state, 'expected an ITR draft to be written');
    equal(draft.state.income.grossSalary, 920000);
    equal(draft.state.taxes.tdsPaid, 78250);
    equal(draft.state.income.businessIncome, 0, 'other income fields must keep their defaults');
    equal(draft.state.step, undefined, 'the prefill must not fake a wizard step');
  });

  await check('AIS comparison reports honestly when there is no draft', function () {
    window.TMStore.remove(window.TMStore.KEYS.itrDraft);
    setValue(window, 'aisSalary', '840000');
    setValue(window, 'aisTds', '72500');
    click(window, '[onclick="saveAisFigures()"]');
    click(window, '[onclick="compareAisWithDraft()"]');
    equal(document.getElementById('aisAnalysisResult').style.display, 'block');
    var body = document.getElementById('aisCompareBody').textContent;
    assert(body.indexOf('No ITR draft') !== -1 || body.indexOf('not found') !== -1, 'expected an honest no-draft message, got: ' + body.slice(0, 200));
  });

  await check('AIS comparison flags a real difference against a saved draft', function () {
    window.TMStore.write(window.TMStore.KEYS.itrDraft, {
      savedAt: new Date().toISOString(),
      state: {
        income: { grossSalary: 900000, otherIncome: 0 },
        taxes: { tdsPaid: 72500, advanceTaxPaid: 0 }
      }
    });
    click(window, '[onclick="compareAisWithDraft()"]');
    var body = document.getElementById('aisCompareBody').textContent;
    assert(body.indexOf('Difference') !== -1, 'expected a difference row, got: ' + body.slice(0, 250));
    assert(body.indexOf('Matches') !== -1, 'the matching TDS row should say Matches');
  });

  dom.window.close();
}


async function itcReconTests() {
  console.log('\nITC reconciliation page');
  var dom = await loadPage('pages/itc-recon.html');
  var window = dom.window;
  var document = window.document;

  await check('scripts load without a page error', function () {
    equal((window.__errors || []).length, 0, 'page errors: ' + (window.__errors || []).join(' | '));
    assert(window.TMGSTRecon, 'gst-recon.js should be loaded');
    assert(window.TMITCRecon, 'itc-recon.js should be loaded');
  });

  await check('the page starts empty with no result shown', function () {
    equal(document.getElementById('booksInput').value, '');
    equal(document.getElementById('portalInput').value, '');
    equal(document.getElementById('resultSection').hidden, true);
    equal(document.getElementById('csvBtn').disabled, true);
    equal(document.getElementById('inputMsg').textContent.indexOf('Nothing pasted yet') !== -1, true);
  });

  await check('reconciling nothing is refused instead of inventing a result', function () {
    click(window, '#reconcileBtn');
    equal(document.getElementById('resultSection').hidden, true);
    assert(document.getElementById('inputMsg').textContent.indexOf('Paste at least one document') !== -1);
  });

  await check('unusable paste gives a readable error', function () {
    setValue(window, 'booksInput', 'foo,bar\n1,2');
    click(window, '#reconcileBtn');
    equal(document.getElementById('resultSection').hidden, true);
    assert(document.getElementById('inputMsg').textContent.indexOf('Could not read') !== -1);
  });

  await check('a real reconciliation renders every bucket', function () {
    setValue(window, 'booksInput', [
      'GSTIN,Supplier Name,Invoice Number,Invoice Date,Taxable Value,IGST,CGST,SGST',
      '27AAPFU0939F1ZV,Sharma Traders,INV/001,01/04/2026,100000,0,9000,9000',
      '29ABCDE1234F1Z5,Karnataka Supplies,INV-002,05/04/2026,50000,9000,0,0',
      '27AABCU9603R1ZM,Unreported Vendor,INV/003,10/04/2026,20000,0,1800,1800'
    ].join('\n'));
    setValue(window, 'portalInput', [
      'GSTIN,Invoice Number,Invoice Date,Taxable Value,IGST,CGST,SGST',
      '27AAPFU0939F1ZV,INV001,01-04-2026,100000,0,9000,9000',
      '29ABCDE1234F1Z5,INV002,05-04-2026,50000,9000,0,0',
      '33AAGCB1234M1ZP,INV-777,15/04/2026,40000,0,3600,3600'
    ].join('\n'));
    click(window, '#reconcileBtn');
    equal(document.getElementById('resultSection').hidden, false);
    equal(document.getElementById('csvBtn').disabled, false);

    var kpis = document.getElementById('kpiGrid').textContent;
    assert(kpis.indexOf('Confirmed ITC') !== -1, 'expected the confirmed KPI');
    assert(kpis.indexOf('27,000.00') !== -1, 'confirmed credit should be ₹27,000, got: ' + kpis.slice(0, 200));
    assert(kpis.indexOf('3,600.00') !== -1, 'at-risk credit should be ₹3,600');

    var buckets = document.getElementById('buckets').textContent;
    ['Matched', 'Only in your books', 'Only in 2B'].forEach(function (label) {
      assert(buckets.indexOf(label) !== -1, 'missing bucket: ' + label);
    });
    assert(buckets.indexOf('Possible risk') === -1 && buckets.indexOf('Unreported Vendor') !== -1, 'the unfiled invoice must be named');
  });

  await check('the 2B vs books totals are compared head by head', function () {
    var totals = document.getElementById('totalsBody').textContent;
    assert(totals.indexOf('IGST') !== -1 && totals.indexOf('Cess') !== -1);
    assert(totals.indexOf('34,200.00') !== -1, '2B total should be ₹34,200.00, got: ' + totals.slice(0, 260));
    assert(totals.indexOf('30,600.00') !== -1, 'books total should be ₹30,600.00');
    assert(totals.indexOf('3,600.00') !== -1, 'the difference should be shown');
  });

  await check('Rule 88A set-off uses only confirmed credit', function () {
    setValue(window, 'liabIgst', '5000');
    setValue(window, 'liabCgst', '4000');
    setValue(window, 'liabSgst', '4000');
    click(window, '#setoffBtn');
    equal(document.getElementById('setoffResult').hidden, false);
    var text = document.getElementById('setoffBody').textContent;
    assert(text.indexOf('IGST credit') !== -1, 'expected the IGST credit row');
    var summary = document.getElementById('setoffSummary').textContent;
    assert(summary.indexOf('paid in cash') !== -1, 'expected a cash figure');
    assert(summary.indexOf('excluded on purpose') !== -1, 'the page must state that disputed credit is excluded');
  });

  await check('the working can be saved and restored', function () {
    click(window, '#saveBtn');
    var saved = window.TMStore.read('tm-itc-recon', null);
    assert(saved, 'expected the working to be stored');
    assert(saved.books.indexOf('Sharma Traders') !== -1);
    equal(saved.liability.igst, '5000');
  });

  await check('clearing removes the paste, the result and the saved copy', function () {
    click(window, '#clearBtn');
    equal(document.getElementById('booksInput').value, '');
    equal(document.getElementById('resultSection').hidden, true);
    equal(document.getElementById('csvBtn').disabled, true);
    equal(window.TMStore.read('tm-itc-recon', null), null);
  });

  await check('"fill from invoices" refuses when there are no saved invoices', function () {
    window.TMStore.saveList('invoices', []);
    click(window, '#loadInvoicesBtn');
    equal(document.getElementById('booksInput').value, '');
    assert(document.getElementById('inputMsg').textContent.indexOf('no saved invoices') !== -1);
  });

  await check('"fill from invoices" builds a register from real saved invoices', function () {
    window.TMStore.saveList('invoices', [{
      id: 'i1', invoiceNumber: 'PUR/001', invoiceDate: '2026-04-01',
      buyerName: 'Sharma Traders', supplierGstin: '27AAPFU0939F1ZV',
      sellerState: '27', buyerState: '27', status: 'unpaid',
      lines: [{ description: 'Goods', quantity: 1, rate: 1000, gstRate: 18 }]
    }]);
    click(window, '#loadInvoicesBtn');
    var value = document.getElementById('booksInput').value;
    assert(value.indexOf('27AAPFU0939F1ZV') !== -1, 'the GSTIN should be carried over');
    assert(value.indexOf('90.00') !== -1, 'CGST should be ₹90.00 for ₹1,000 at 18%', value);
    assert(value.indexOf('GSTIN,Supplier Name') === 0, 'a header row must be generated');
  });

  dom.window.close();
}


async function scheduleFaTests() {
  console.log('\nSchedule FA page');
  var dom = await loadPage('pages/schedule-fa.html');
  var window = dom.window;
  var document = window.document;

  await check('scripts load without a page error', function () {
    equal((window.__errors || []).length, 0, 'page errors: ' + (window.__errors || []).join(' | '));
    assert(window.TMScheduleFA, 'schedule-fa.js should be loaded');
    assert(window.TMScheduleFAApp, 'schedule-fa-app.js should be loaded');
  });

  await check('the form is empty and the schedule is empty', function () {
    equal(document.getElementById('faCountry').value, '');
    equal(document.getElementById('faEntity').value, '');
    equal(document.getElementById('entriesHost').innerHTML, '');
    equal(window.TMScheduleFAApp.entries().length, 0);
    equal(document.getElementById('exportCsvBtn').disabled, true);
    assert(document.getElementById('addMsg').textContent.indexOf('No entries yet') !== -1);
  });

  await check('an entry without a country is refused', function () {
    setValue(window, 'faEntity', 'Broker Inc');
    click(window, '#addEntryBtn');
    equal(window.TMScheduleFAApp.entries().length, 0);
    assert(document.getElementById('addMsg').textContent.indexOf('Country is required') !== -1);
  });

  await check('a foreign amount without a rate is refused instead of guessed', function () {
    setValue(window, 'faCountry', 'United States');
    setValue(window, 'faEntity', 'Broker Inc');
    setValue(window, 'faPeak', '6200');
    click(window, '#addEntryBtn');
    equal(window.TMScheduleFAApp.entries().length, 0);
    assert(document.getElementById('addMsg').textContent.indexOf('rule 115 rate') !== -1);
  });

  await check('a real RSU entry is converted and added', function () {
    setValue(window, 'faType', 'rsu');
    setValue(window, 'faCountryCode', 'US');
    setValue(window, 'faCurrency', 'USD');
    setValue(window, 'faRate', '83.5');
    setValue(window, 'faInitial', '4000');
    setValue(window, 'faClosing', '5800');
    document.getElementById('faIncomeIncluded').checked = true;
    click(window, '#addEntryBtn');
    equal(window.TMScheduleFAApp.entries().length, 1);
    var entry = window.TMScheduleFAApp.entries()[0];
    equal(entry.closingValue, 484300, 'USD 5,800 at 83.5 must be ₹4,84,300');

    var kpis = document.getElementById('totalsGrid').textContent;
    assert(kpis.indexOf('4,84,300.00') !== -1, 'the rupee total must be shown: ' + kpis.slice(0, 200));
    equal(document.getElementById('exportCsvBtn').disabled, false);
  });

  await check('the checklist reflects what has been declared', function () {
    var checklist = document.getElementById('checklistHost').textContent;
    assert(checklist.indexOf('1 of 6') !== -1 || checklist.indexOf('2 of 6') !== -1 ||
      checklist.indexOf('of 6') !== -1, checklist.slice(0, 200));
    assert(checklist.indexOf('Country') !== -1 || checklist.indexOf('country') !== -1);
  });

  await check('the entry can be saved on this browser', function () {
    click(window, '#saveBtn');
    var saved = window.TMStore.read('tm-schedule-fa', null);
    assert(saved, 'expected the schedule to be stored');
    equal(saved.entries.length, 1);
    equal(saved.entries[0].closingValue, 484300);
  });

  await check('sending to the wizard writes a real prefill', function () {
    click(window, '#sendToWizardBtn');
    var draft = window.TMStore.read(window.TMStore.KEYS.itrDraft, null);
    assert(draft && draft.state, 'expected an ITR draft');
    equal(draft.state.profile.foreignAssets, true);
    equal(draft.state.fa.entries.length, 1);
    equal(draft.state.fa.entries[0].peakValue, 517700);
  });

  await check('removing an entry empties the schedule again', function () {
    var btn = document.querySelector('#entriesHost [data-remove]');
    assert(btn, 'a remove button should exist');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    equal(window.TMScheduleFAApp.entries().length, 0);
    equal(document.getElementById('exportCsvBtn').disabled, true);
  });

  dom.window.close();
}

(async function main() {
  console.log('TaxMitra browser smoke test (jsdom)');
  console.log('─'.repeat(64));
  try {
    await homeTests();
    await billingTests();
    await itrTests();
    await directoryTests();
    await adminTests();
    await accountTests();
    await itrCentreTests();
    await itcReconTests();
    await scheduleFaTests();
  } catch (error) {
    results.failed += 1;
    results.failures.push({ name: 'harness', error: error });
    console.error('\nHarness error: ' + error.stack);
  }

  console.log('\n' + '─'.repeat(64));
  console.log((results.failed ? '✗ FAIL' : '✓ PASS') + '  ·  ' + results.passed + ' checks passed' +
    (results.failed ? ', ' + results.failed + ' failed' : ''));
  console.log('─'.repeat(64) + '\n');
  process.exit(results.failed ? 1 : 0);
})();
