#!/usr/bin/env node
/* ===================================================
   TaxMitra test runner
   Usage: npm test            (all suites)
          npm test -- gst     (only files matching "gst")
   =================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var t = require('./harness');

var filter = process.argv.slice(2).filter(function (arg) { return arg.indexOf('-') !== 0; })[0] || '';

var files = fs.readdirSync(__dirname)
  .filter(function (file) {
    return file.endsWith('.test.js') && file !== 'harness.js';
  })
  .filter(function (file) { return !filter || file.indexOf(filter) !== -1; })
  .sort();

if (!files.length) {
  console.error('No test files matched "' + filter + '"');
  process.exit(1);
}

console.log('TaxMitra test suite');
console.log('Node ' + process.version + ' · ' + files.length + ' test file(s)' +
  (filter ? ' matching "' + filter + '"' : ''));
console.log('─'.repeat(64));

files.forEach(function (file) {
  var before = t.stats();
  var start = Date.now();
  require(path.join(__dirname, file));
  var after = t.stats();
  var ran = after.passed + after.failed - (before.passed + before.failed);
  var added = after.assertions - before.assertions;
  var failed = after.failed - before.failed;
  var ms = Date.now() - start;
  console.log(
    (failed ? '✗' : '✓') + ' ' + file.padEnd(28) +
    String(ran).padStart(3) + ' tests · ' +
    String(added).padStart(4) + ' assertions · ' +
    String(ms).padStart(4) + ' ms' +
    (failed ? '  ← ' + failed + ' failed' : '')
  );
});

var passed = t.report();
process.exit(passed ? 0 : 1);
