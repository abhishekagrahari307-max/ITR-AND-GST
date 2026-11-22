'use strict';

/* A tiny, dependency-free cascade reader for the properties that decide
   whether a page fits on a phone. We cannot run a browser in CI without
   downloading one, but "which rule wins at 390px?" is answerable by
   walking the stylesheets in load order and keeping the last declaration
   whose media query matches.

   What it protects:
     • the module / stats grids collapse by available space, not by a
       media query that a phone might not match
     • the quick-tool strip wraps instead of scrolling sideways
     • the closed mobile drawer never sits outside the viewport
*/

var t = require('./harness');
var path = require('path');
var fs = require('fs');

var suite = t.suite;
var test = t.test;
var ROOT = path.join(__dirname, '..');

var SHEETS = ['css/taxmitra.css', 'css/responsive.css', 'css/ui.css'];
var MOBILE = 390;
var TABLET = 768;

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/* Split a stylesheet into { media, selector, declarations } in file order. */
function parseSheet(css) {
  var out = [];
  var text = stripComments(css);
  var stack = [];
  var i = 0;
  var buffer = '';

  while (i < text.length) {
    var ch = text[i];
    if (ch === '{') {
      var head = buffer.trim();
      buffer = '';
      if (head.charAt(0) === '@') {
        stack.push({ type: 'at', head: head, declarations: null });
      } else {
        var rule = { type: 'rule', media: mediaOf(stack), selector: head, declarations: null };
        stack.push(rule);
      }
      i += 1;
      continue;
    }
    if (ch === '}') {
      var closing = stack.pop();
      if (closing && closing.type === 'rule') {
        closing.declarations = parseDeclarations(buffer);
        out.push(closing);
      }
      buffer = '';
      i += 1;
      continue;
    }
    buffer += ch;
    i += 1;
  }
  return out;
}

function mediaOf(stack) {
  return stack.filter(function (entry) { return entry.type === 'at' && /^@media/i.test(entry.head); });
}

function parseDeclarations(body) {
  var map = {};
  body.split(';').forEach(function (chunk) {
    var index = chunk.indexOf(':');
    if (index === -1) return;
    var name = chunk.slice(0, index).trim().toLowerCase();
    var value = chunk.slice(index + 1).trim();
    if (name) map[name] = value;
  });
  return map;
}

/* Supports the media features this project actually uses. Anything else
   (colour scheme, orientation, print) is treated as not matching a phone. */
function mediaMatches(entry, width) {
  var condition = entry.head.replace(/^@media\s*/i, '').replace(/[()]/g, ' ');
  if (/print/i.test(condition)) return false;
  if (/prefers-color-scheme|prefers-reduced-motion|orientation/i.test(condition)) return false;

  var clauses = condition.split(',').map(function (part) { return part.trim(); }).filter(Boolean);
  return clauses.some(function (clause) {
    var ok = true;
    var max = /max-width\s*:\s*([\d.]+)px/.exec(clause);
    var min = /min-width\s*:\s*([\d.]+)px/.exec(clause);
    var maxHeight = /max-height\s*:\s*([\d.]+)px/.exec(clause);
    if (max && width > parseFloat(max[1])) ok = false;
    if (min && width < parseFloat(min[1])) ok = false;
    if (maxHeight) ok = false;                    // height queries never decide phone width
    return ok;
  });
}

var RULES = [];
SHEETS.forEach(function (file) {
  var sheet = parseSheet(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  sheet.forEach(function (rule) { rule.file = file; RULES.push(rule); });
});

/* The effective value of a property for a selector list at a viewport width.
   Selector matching is deliberately literal: we assert on class names the
   project owns, not on the full selector engine. */
function effective(selectors, property, width) {
  var wanted = [].concat(selectors);
  var winner = null;
  RULES.forEach(function (rule) {
    var matchesSelector = rule.selector.split(',').some(function (part) {
      var clean = part.trim();
      return wanted.indexOf(clean) !== -1;
    });
    if (!matchesSelector) return;
    if (!(property in rule.declarations)) return;
    var mediaOk = rule.media.every(function (entry) { return mediaMatches(entry, width); });
    if (!mediaOk) return;
    winner = { value: rule.declarations[property], file: rule.file, selector: rule.selector };
  });
  return winner;
}

suite('Layout · the phone gets a single-column card grid', function () {
  test('the module grid collapses intrinsically, whatever the reported width', function () {
    var rule = effective(['.modules-grid', '.tm-ui .modules-grid'], 'grid-template-columns', MOBILE);
    t.ok(rule, 'no grid-template-columns rule reaches .modules-grid');
    t.includes(rule.value, 'auto-fit', 'the winning rule must fold by available space: ' + JSON.stringify(rule));
    t.includes(rule.value, 'min(100%', 'columns must never exceed the container: ' + JSON.stringify(rule));
  });

  test('the stats grid folds the same way', function () {
    var rule = effective(['.stats-grid', '.tm-ui .stats-grid', '.tm-ui .kpi-grid'], 'grid-template-columns', MOBILE);
    t.ok(rule, 'the stats grid needs a grid-template-columns rule');
    // either an explicit single column, or a track list that folds by itself
    var folds = /^1fr$/.test(rule.value.trim()) || /auto-fit|auto-fill/.test(rule.value);
    t.ok(folds, 'stat cards must fold to one column on a phone: ' + JSON.stringify(rule));
    t.notOk(/^repeat\(\s*[2-9]/.test(rule.value.trim()), 'no fixed multi-column track at 390px: ' + rule.value);
  });

  test('the older sheet no longer forces two columns on a phone', function () {
    var sheet = fs.readFileSync(path.join(ROOT, 'css', 'responsive.css'), 'utf8');
    t.notOk(/stats-grid\s*\{[^}]*1fr 1fr\s*!important/.test(sheet),
      'a forced two-column stat grid is what squeezes phone screens');
  });
});

suite('Layout · nothing scrolls sideways on a phone', function () {
  test('the quick-tool strip wraps', function () {
    var wrap = effective(['.quick-tools-grid', '.tm-ui .quick-tools-grid'], 'flex-wrap', MOBILE);
    t.ok(wrap, 'the quick-tool strip needs an explicit wrap rule');
    t.equal(wrap.value, 'wrap', 'the strip must wrap on phones: ' + JSON.stringify(wrap));
  });

  test('the document clips horizontal overflow', function () {
    var html = /(?:^|\n)html\s*\{([\s\S]*?)\n\}/.exec(fs.readFileSync(path.join(ROOT, 'css/ui.css'), 'utf8'));
    t.ok(html, 'css/ui.css must contain an html block');
    t.includes(html[1], 'overflow-x', 'html must clip horizontal overflow');
  });

  test('the closed drawer stays inside the viewport', function () {
    var drawer = effective(['.tm-ui .navbar-main .nav-links-wrapper'], 'clip-path', TABLET);
    t.ok(drawer, 'the mobile drawer needs a clip-path rule');
    t.includes(drawer.value, 'inset', 'the drawer hides by clipping: ' + JSON.stringify(drawer));
    var translate = effective(['.tm-ui .navbar-main .nav-links-wrapper'], 'translate', TABLET);
    t.notOk(translate && /%/.test(translate.value), 'the drawer must not be translated off-screen');
  });
});

suite('Layout · the cascade reader itself', function () {
  test('media queries are evaluated, not ignored', function () {
    var narrow = effective(['.modules-grid'], 'grid-template-columns', MOBILE);
    var wide = effective(['.modules-grid'], 'grid-template-columns', 1600);
    t.ok(narrow && wide, 'both widths must resolve a rule');
    t.notEqual(narrow.value, wide.value, 'width should change the winner between 390 and 1600');
  });

  test('load order matters: ui.css is read last', function () {
    var rule = effective(['.modules-grid', '.tm-ui .modules-grid'], 'grid-template-columns', 1600);
    t.equal(rule.file, 'css/ui.css', 'the interface layer must win over the older sheets');
  });

  test('no interface-layer grid needs !important', function () {
    var ui = fs.readFileSync(path.join(ROOT, 'css', 'ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    var themed = ui.split('\n').filter(function (line) {
      return line.indexOf('!important') !== -1 && /grid-template|min-width|max-width/.test(line);
    });
    t.equal(themed.length, 0, 'layout must not be forced: ' + themed.join(' | '));
  });
});
