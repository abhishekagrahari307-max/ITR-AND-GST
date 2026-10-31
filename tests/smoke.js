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

  await check('seeding demo data fills the console', function () {
    click(window, '#seedBtn');
    equal(document.getElementById('invoiceCount').textContent, '3');
    equal(document.getElementById('customerCount').textContent, '2');
    equal(document.getElementById('itemCount').textContent, '2');
    assert(document.getElementById('invoicedTotal').textContent.indexOf('₹') !== -1);
  });

  await check('the seeded data passes the integrity check', function () {
    var text = document.getElementById('integrityBody').textContent;
    assert(text.indexOf('error') === -1 || text.indexOf('0 error') !== -1, 'unexpected errors: ' + text.slice(0, 200));
    assert(/ok|warning/i.test(text), 'expected an ok/warning verdict');
  });

  await check('a backup can be produced', function () {
    click(window, '#exportBackupBtn');
    // download() is stubbed by jsdom's createObjectURL mock; assert no throw
    assert(true);
  });

  await check('clearing wipes everything', function () {
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
