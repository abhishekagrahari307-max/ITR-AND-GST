'use strict';

var t = require('./harness');
var path = require('path');
var fs = require('fs');

var suite = t.suite;
var test = t.test;
var ROOT = path.join(__dirname, '..');

var NEW_PAGES = ['billing.html', 'itr-form.html', 'github-tools.html', 'admin.html'];

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function exists(relative) {
  return fs.existsSync(path.join(ROOT, relative));
}

function allHtmlFiles() {
  var files = fs.readdirSync(ROOT).filter(function (f) { return f.endsWith('.html'); });
  var pagesDir = path.join(ROOT, 'pages');
  if (fs.existsSync(pagesDir)) {
    fs.readdirSync(pagesDir).filter(function (f) { return f.endsWith('.html'); })
      .forEach(function (f) { files.push('pages/' + f); });
  }
  return files;
}

function scriptSources(html) {
  var sources = [];
  var regex = /<script[^>]*\ssrc="([^"]+)"/gi;
  var match;
  while ((match = regex.exec(html)) !== null) sources.push(match[1]);
  return sources;
}

function stylesheetSources(html) {
  var sources = [];
  var regex = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/gi;
  var match;
  while ((match = regex.exec(html)) !== null) sources.push(match[1]);
  return sources;
}

function idsIn(html) {
  var ids = [];
  var regex = /\sid="([^"]+)"/gi;
  var match;
  while ((match = regex.exec(html)) !== null) ids.push(match[1]);
  return ids;
}

suite('Pages · the four new modules exist', function () {
  NEW_PAGES.forEach(function (page) {
    test(page + ' exists and is a full document', function () {
      t.ok(exists('pages/' + page), page + ' is missing');
      var html = read('pages/' + page);
      t.includes(html, '<!DOCTYPE html>');
      t.includes(html, '</html>');
      t.includes(html, 'name="viewport"');
      t.matches(html, /<title>[^<]{5,}<\/title>/, page + ' needs a real title');
      t.includes(html, '../css/taxmitra.css');
      t.includes(html, '../index.html', page + ' should link back to the homepage');
    });
  });

  test('supporting scripts exist', function () {
    ['js/gst-billing.js', 'js/income-tax.js', 'js/tm-store.js', 'js/billing-app.js',
      'js/itr-form.js', 'js/github-tools.js', 'js/admin.js'].forEach(function (file) {
      t.ok(exists(file), file + ' is missing');
    });
  });

  test('every local script and stylesheet reference resolves', function () {
    allHtmlFiles().forEach(function (file) {
      var html = read(file);
      var base = path.dirname(file);
      scriptSources(html).concat(stylesheetSources(html)).forEach(function (src) {
        if (/^(https?:)?\/\//.test(src) || src.indexOf('data:') === 0) return;
        var resolved = path.normalize(path.join(base, src));
        t.ok(exists(resolved), file + ' references missing ' + src);
      });
    });
  });
});

suite('Pages · no duplicate element ids', function () {
  NEW_PAGES.forEach(function (page) {
    test(page + ' has unique ids', function () {
      var ids = idsIn(read('pages/' + page));
      var seen = {};
      ids.forEach(function (id) {
        t.notOk(seen[id], page + ' has a duplicate id: ' + id);
        seen[id] = true;
      });
      t.ok(ids.length > 5, page + ' should have a meaningful number of ids, found ' + ids.length);
    });
  });
});

suite('Pages · script dependencies', function () {
  test('billing page loads the GST engine before the billing app', function () {
    var html = read('pages/billing.html');
    var sources = scriptSources(html);
    var engine = sources.indexOf('../js/gst-billing.js');
    var store = sources.indexOf('../js/tm-store.js');
    var app = sources.indexOf('../js/billing-app.js');
    t.ok(engine !== -1, 'billing.html must load gst-billing.js');
    t.ok(store !== -1, 'billing.html must load tm-store.js');
    t.ok(app !== -1, 'billing.html must load billing-app.js');
    t.ok(engine < app, 'gst-billing.js must load before billing-app.js');
    t.ok(store < app, 'tm-store.js must load before billing-app.js');
  });

  test('ITR page loads the tax engine before the wizard', function () {
    var sources = scriptSources(read('pages/itr-form.html'));
    var engine = sources.indexOf('../js/income-tax.js');
    var wizard = sources.indexOf('../js/itr-form.js');
    t.ok(engine !== -1 && wizard !== -1);
    t.ok(engine < wizard, 'income-tax.js must load before itr-form.js');
  });

  test('admin page loads the engines it uses', function () {
    var sources = scriptSources(read('pages/admin.html'));
    ['../js/tm-store.js', '../js/gst-billing.js', '../js/income-tax.js', '../js/admin.js'].forEach(function (src) {
      t.ok(sources.indexOf(src) !== -1, 'admin.html should load ' + src);
    });
  });

  test('billing page wires the controls the app expects', function () {
    var html = read('pages/billing.html');
    ['lineRows', 'saveInvoice', 'addLine', 'buyerGstin', 'buyerState', 'totGrand',
      'invoiceBody', 'recentBody', 'ageingBody', 'customerForm', 'itemForm', 'settingsForm',
      'exportJsonBtn', 'clearInvoicesBtn', 'toastHost', 'printArea'].forEach(function (id) {
      t.includes(html, 'id="' + id + '"', 'billing.html is missing #' + id);
    });
  });

  test('ITR wizard wires every step panel', function () {
    var html = read('pages/itr-form.html');
    for (var i = 1; i <= 7; i++) t.includes(html, 'id="step' + i + '"', 'missing step' + i);
    ['stepNav', 'stepErrors', 'comparisonBody', 'comparisonSummary', 'slabBreakdown',
      'advanceTaxBody', 'reviewBody', 'reviewWarnings', 'exportBtn', 'stepLabel'].forEach(function (id) {
      t.includes(html, 'id="' + id + '"', 'itr-form.html is missing #' + id);
    });
  });

  test('every bindable ITR field maps to a real state path', function () {
    var T = require(path.join(ROOT, 'js', 'income-tax.js'));
    t.ok(T, 'engine loads');
    var html = read('pages/itr-form.html');
    var regex = /data-bind="([^"]+)"/g;
    var match;
    var allowed = ['profile', 'income', 'gains', 'deductions', 'taxes'];
    var count = 0;
    while ((match = regex.exec(html)) !== null) {
      var segments = match[1].split('.');
      t.equal(segments.length, 2, 'bind path should be group.field: ' + match[1]);
      t.ok(allowed.indexOf(segments[0]) !== -1, 'unknown state group in ' + match[1]);
      count += 1;
    }
    t.ok(count >= 30, 'expected at least 30 bound fields, found ' + count);
  });
});

suite('Pages · navigation', function () {
  test('the homepage links to every new module', function () {
    var html = read('index.html');
    ['pages/billing.html', 'pages/itr-form.html', 'pages/github-tools.html', 'pages/admin.html'].forEach(function (href) {
      t.includes(html, href, 'index.html should link to ' + href);
    });
  });

  test('new pages cross-link to each other', function () {
    t.includes(read('pages/billing.html'), 'itr-form.html');
    t.includes(read('pages/billing.html'), 'admin.html');
    t.includes(read('pages/itr-form.html'), 'billing.html');
    t.includes(read('pages/admin.html'), 'billing.html');
    t.includes(read('pages/github-tools.html'), 'billing.html');
  });

  test('internal page links in the new pages resolve', function () {
    NEW_PAGES.forEach(function (page) {
      var html = read('pages/' + page);
      var regex = /href="(?!https?:|#|mailto:)([^"#?]+\.html)/g;
      var match;
      while ((match = regex.exec(html)) !== null) {
        var resolved = path.normalize(path.join('pages', match[1]));
        t.ok(exists(resolved), page + ' links to missing ' + match[1]);
      }
    });
  });
});

suite('Pages · honesty and disclaimers', function () {
  test('billing page states what it does not do', function () {
    var html = read('pages/billing.html').toLowerCase();
    t.includes(html, 'does not file returns');
    t.includes(html, 'not an official upload file');
    t.includes(html, 'localstorage');
  });

  test('ITR page states it is not a filing portal', function () {
    var html = read('pages/itr-form.html').toLowerCase();
    t.includes(html, 'not a filing portal');
    t.includes(html, 'does not submit a return');
  });

  test('directory page explains the verification method', function () {
    var html = read('pages/github-tools.html').toLowerCase();
    t.includes(html, 'github rest api');
    t.includes(html, 'not');
    t.includes(html, 'licence');
  });

  test('admin page warns about browser-local storage', function () {
    var html = read('pages/admin.html').toLowerCase();
    t.includes(html, 'localstorage');
    t.includes(html, 'backup');
  });
});

suite('Pages · accessibility basics', function () {
  test('inputs have labels or aria-labels', function () {
    NEW_PAGES.forEach(function (page) {
      var html = read('pages/' + page);
      var regex = /<input\b([^>]*)>/gi;
      var match;
      var unlabelled = 0;
      while ((match = regex.exec(html)) !== null) {
        var attrs = match[1];
        if (/type="(file|hidden|checkbox)"/.test(attrs)) continue;
        var idMatch = /id="([^"]+)"/.exec(attrs);
        var hasLabel = idMatch && html.indexOf('for="' + idMatch[1] + '"') !== -1;
        var hasAria = /aria-label=/.test(attrs);
        if (!hasLabel && !hasAria) unlabelled += 1;
      }
      t.equal(unlabelled, 0, page + ' has ' + unlabelled + ' unlabelled input(s)');
    });
  });

  test('tables declare their headers', function () {
    NEW_PAGES.forEach(function (page) {
      var html = read('pages/' + page);
      var tables = html.match(/<table/gi) || [];
      var heads = html.match(/<thead/gi) || [];
      // A page without tables needs no headers; a page with tables must label them.
      if (tables.length) t.ok(heads.length > 0, page + ' should use <thead>');
      t.ok(tables.length >= heads.length, page + ' has a table without a <thead>');
    });
  });

  test('toast hosts are announced to screen readers', function () {
    t.includes(read('pages/billing.html'), 'aria-live="polite"');
    t.includes(read('pages/admin.html'), 'aria-live="polite"');
  });
});

suite('Pages · print support', function () {
  test('billing page has a print stylesheet and print area', function () {
    var html = read('pages/billing.html');
    t.includes(html, '@media print');
    t.includes(html, 'id="printArea"');
  });

  test('ITR page can print the computation', function () {
    var html = read('pages/itr-form.html');
    t.includes(html, '@media print');
    t.includes(html, 'id="printComputation"');
  });
});
