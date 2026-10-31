'use strict';

/* ===================================================
   Dead-handler detector.
   Every inline on*="fn(" in every page must resolve to something the page
   can actually call: a <script> inline definition, a function defined in a
   local script the page loads, a window.* assignment, or a known browser
   global. This is what an undefined-function bug looks like to a visitor:
   a button that does nothing.
   =================================================== */

var t = require('./harness');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

/* A small allowlist of browser globals that pages legitimately call inline. */
var BROWSER_GLOBALS = [
  'alert', 'confirm', 'prompt', 'print', 'focus', 'blur', 'open', 'close',
  'scrollTo', 'scrollBy', 'history', 'location', 'localStorage', 'sessionStorage'
];

/* Inline handlers may contain statements (onclick="if (x) fn()"), so keywords
   that are followed by "(" must not be treated as function calls. */
var JS_KEYWORDS = ['if', 'for', 'while', 'switch', 'return', 'typeof', 'function',
  'catch', 'new', 'delete', 'void', 'in', 'of', 'do', 'else'];

function pageFiles() {
  var files = fs.readdirSync(ROOT).filter(function (f) { return f.endsWith('.html'); });
  var pagesDir = path.join(ROOT, 'pages');
  fs.readdirSync(pagesDir).filter(function (f) { return f.endsWith('.html'); })
    .forEach(function (f) { files.push('pages/' + f); });
  return files;
}

function resolveLocalScript(fromFile, src) {
  if (/^(https?:)?\/\//.test(src)) return null;      // CDN
  if (src.indexOf('data:') === 0) return null;
  var resolved = path.normalize(path.join(path.dirname(fromFile), src));
  var absolute = path.join(ROOT, resolved);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
}

/** All code a page can run: inline scripts plus every local script it loads. */
function availableCode(file) {
  var html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  var code = '';
  var inlineOnly = '';
  var regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  var match;
  while ((match = regex.exec(html)) !== null) {
    var attrs = match[1] || '';
    var body = match[2] || '';
    if (/\ssrc=/.test(attrs)) {
      var srcMatch = /\ssrc="([^"]+)"/i.exec(attrs);
      if (srcMatch) {
        var loaded = resolveLocalScript(file, srcMatch[1]);
        if (loaded) code += loaded + '\n';
      }
    } else {
      inlineOnly += body + '\n';
    }
  }
  return { html: html, code: code + '\n' + inlineOnly, inline: inlineOnly };
}

function handlerNames(html) {
  var names = {};
  var regex = /\son(?:click|change|input|submit|keyup|keydown|mouseover)="([a-zA-Z_$][\w$]*)\s*\(/g;
  var match;
  while ((match = regex.exec(html)) !== null) names[match[1]] = true;
  return Object.keys(names);
}

function isDefined(name, code) {
  var patterns = [
    'function\\s+' + name + '\\b',
    '\\b(?:var|let|const)\\s+' + name + '\\b',
    '\\b' + name + '\\s*=\\s*(?:function|async|\\()',
    'window\\.' + name + '\\s*=',
    'window\\[\\s*[\'"]' + name + '[\'"]\\s*\\]'
  ];
  var regex = new RegExp(patterns.join('|'));
  return regex.test(code);
}

t.suite('Handlers · every inline handler resolves', function () {
  pageFiles().forEach(function (file) {
    var bundled = availableCode(file);
    var names = handlerNames(bundled.html);

    t.test(file + ' defines all ' + names.length + ' inline handlers', function () {
      var missing = names.filter(function (name) {
        if (BROWSER_GLOBALS.indexOf(name) !== -1) return false;
        if (JS_KEYWORDS.indexOf(name) !== -1) return false;
        return !isDefined(name, bundled.code);
      });
      t.deepEqual(missing, [], file + ' calls undefined handler(s): ' + missing.join(', '));
    });
  });
});

t.suite('Handlers · no localhost endpoints in shipped pages', function () {
  pageFiles().forEach(function (file) {
    t.test(file + ' has no hardcoded localhost URL', function () {
      var html = fs.readFileSync(path.join(ROOT, file), 'utf8');
      var hits = html.match(/https?:\/\/(?:localhost|127\.0\.0\.1)[^\s"']*/g) || [];
      t.deepEqual(hits, [], file + ' hardcodes a local address: ' + hits.join(', '));
    });
  });

  t.test('api.js defaults to a same-origin base, not localhost', function () {
    var source = fs.readFileSync(path.join(ROOT, 'js', 'api.js'), 'utf8');
    t.notOk(/localhost|127\.0\.0\.1/.test(source), 'js/api.js must not fall back to localhost when deployed');
  });
});

t.suite('Handlers · no leftover dead anchors in primary pages', function () {
  ['index.html', 'pages/billing.html', 'pages/itr-form.html', 'pages/admin.html', 'pages/github-tools.html'].forEach(function (file) {
    t.test(file + ' has no href="#" placeholders', function () {
      var html = fs.readFileSync(path.join(ROOT, file), 'utf8');
      var count = (html.match(/href="#"/g) || []).length;
      t.equal(count, 0, file + ' still contains ' + count + ' dead link(s)');
    });
  });
});
