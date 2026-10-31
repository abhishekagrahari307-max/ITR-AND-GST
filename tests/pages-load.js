#!/usr/bin/env node
/* ===================================================
   Page load audit (optional – needs jsdom).
   Loads EVERY page with its local scripts and fails if any page throws
   while starting up. CDN scripts are skipped on purpose: if a page needs a
   library it must degrade gracefully, which is exactly what we want to test.

     npm install --no-save jsdom
     node tests/pages-load.js
   =================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var jsdom;
try {
  jsdom = require('jsdom');
} catch (e) {
  console.log('\n⚠  jsdom is not installed – skipping the page load audit.');
  console.log('   Run `npm install --no-save jsdom` and re-run `node tests/pages-load.js`.\n');
  process.exit(0);
}

var ROOT = path.join(__dirname, '..');

function pageFiles() {
  var files = fs.readdirSync(path.join(ROOT, 'pages'))
    .filter(function (f) { return f.endsWith('.html'); })
    .map(function (f) { return 'pages/' + f; });
  fs.readdirSync(ROOT).filter(function (f) { return f.endsWith('.html'); })
    .forEach(function (f) { files.push(f); });
  return files.sort();
}

function scriptsOf(html) {
  var out = [];
  var regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  var match;
  while ((match = regex.exec(html)) !== null) {
    var attrs = match[1] || '';
    var body = match[2] || '';
    var srcMatch = /\ssrc="([^"]+)"/i.exec(attrs);
    if (srcMatch) out.push({ src: srcMatch[1] });
    else if (body.trim()) out.push({ inline: body });
  }
  return { scripts: out, stripped: html.replace(regex, '') };
}

async function loadPage(relative) {
  var html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  var parsed = scriptsOf(html);

  var dom = new jsdom.JSDOM(parsed.stripped, {
    runScripts: 'dangerously',
    url: 'https://audit.test/' + relative,
    pretendToBeVisual: true,
    beforeParse: function (window) {
      window.__errors = [];
      window.addEventListener('error', function (event) {
        window.__errors.push(String(event.message || (event.error && event.error.message) || 'error'));
      });
      window.IntersectionObserver = function () {
        this.observe = function () {};
        this.unobserve = function () {};
        this.disconnect = function () {};
      };
      window.matchMedia = function () {
        return { matches: false, addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {} };
      };
      window.scrollTo = function () {};
      window.print = function () {};
      window.alert = function () {};
      window.confirm = function () { return false; };
      window.prompt = function () { return null; };
      window.URL.createObjectURL = function () { return 'blob:audit'; };
      window.URL.revokeObjectURL = function () {};
      window.navigator.sendBeacon = function () { return true; };
    }
  });

  var window = dom.window;
  parsed.scripts.forEach(function (script) {
    try {
      if (script.inline) { window.eval(script.inline); return; }
      if (/^(https?:)?\/\//.test(script.src)) return; // CDN: intentionally skipped
      var file = path.join(ROOT, path.dirname(relative), script.src);
      if (!fs.existsSync(file)) return;
      window.eval(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      window.__errors.push('script error: ' + error.message);
    }
  });

  await new Promise(function (resolve) { setTimeout(resolve, 120); });
  var errors = window.__errors.slice();
  dom.window.close();
  return errors;
}

(async function main() {
  var files = pageFiles();
  console.log('TaxMitra page load audit (jsdom)');
  console.log('─'.repeat(64));
  var failures = [];
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var errors;
    try {
      errors = await loadPage(file);
    } catch (error) {
      errors = ['harness: ' + error.message];
    }
    if (errors.length) {
      failures.push({ file: file, errors: errors });
      console.log('  ✗ ' + file);
      errors.slice(0, 3).forEach(function (message) { console.log('      ' + message); });
    }
  }

  console.log('─'.repeat(64));
  console.log((failures.length ? '✗ FAIL' : '✓ PASS') + '  ·  ' + (files.length - failures.length) + '/' + files.length + ' pages start clean');
  console.log('─'.repeat(64) + '\n');
  process.exit(failures.length ? 1 : 0);
})();
