/* ===================================================
   Tiny zero-dependency test harness.
   No npm install required – `npm test` runs Node directly.
   =================================================== */
'use strict';

var state = {
  suites: [],
  current: null,
  passed: 0,
  failed: 0,
  assertions: 0,
  failures: []
};

function suite(name, fn) {
  var previous = state.current;
  state.current = { name: name, before: [], after: [] };
  state.suites.push(state.current);
  if (typeof fn === 'function') fn();
  state.current = previous;
}

function test(name, fn) {
  var suiteName = state.current ? state.current.name : 'default';
  try {
    fn();
    state.passed += 1;
  } catch (error) {
    state.failed += 1;
    state.failures.push({ suite: suiteName, name: name, error: error });
  }
}

function fail(message) {
  throw new Error(message);
}

function ok(value, message) {
  state.assertions += 1;
  if (!value) fail(message || 'Expected a truthy value, received ' + format(value));
}

function notOk(value, message) {
  state.assertions += 1;
  if (value) fail(message || 'Expected a falsy value, received ' + format(value));
}

function equal(actual, expected, message) {
  state.assertions += 1;
  if (actual !== expected) {
    fail((message ? message + ' – ' : '') + 'expected ' + format(expected) + ' but received ' + format(actual));
  }
}

function notEqual(actual, expected, message) {
  state.assertions += 1;
  if (actual === expected) fail((message ? message + ' – ' : '') + 'expected a value different from ' + format(expected));
}

function close(actual, expected, tolerance, message) {
  state.assertions += 1;
  var limit = tolerance === undefined ? 0.01 : tolerance;
  if (typeof actual !== 'number' || isNaN(actual) || Math.abs(actual - expected) > limit) {
    fail((message ? message + ' – ' : '') + 'expected ' + format(expected) + ' ± ' + limit + ' but received ' + format(actual));
  }
}

function deepEqual(actual, expected, message) {
  state.assertions += 1;
  var a = JSON.stringify(actual);
  var b = JSON.stringify(expected);
  if (a !== b) fail((message ? message + ' – ' : '') + 'expected ' + b + ' but received ' + a);
}

function throws(fn, message) {
  state.assertions += 1;
  var threw = false;
  try { fn(); } catch (e) { threw = true; }
  if (!threw) fail(message || 'Expected the function to throw');
}

function matches(value, regex, message) {
  state.assertions += 1;
  if (!regex.test(String(value))) {
    fail((message ? message + ' – ' : '') + format(value) + ' does not match ' + regex);
  }
}

function includes(haystack, needle, message) {
  state.assertions += 1;
  if (String(haystack).indexOf(needle) === -1) {
    fail((message ? message + ' – ' : '') + 'expected to find ' + format(needle) + ' in ' + format(String(haystack).slice(0, 200)));
  }
}

function format(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'undefined') return 'undefined';
  try { return JSON.stringify(value); } catch (e) { return String(value); }
}

function report() {
  var line = '─'.repeat(64);
  console.log('\n' + line);
  if (state.failures.length) {
    console.log('FAILURES');
    state.failures.forEach(function (f) {
      console.log('\n  ✗ [' + f.suite + '] ' + f.name);
      console.log('    ' + f.error.message);
      if (f.error.stack) {
        var frame = String(f.error.stack).split('\n')[1];
        if (frame) console.log('    ' + frame.trim());
      }
    });
    console.log('\n' + line);
  }
  console.log(
    (state.failed ? '✗ FAIL' : '✓ PASS') +
    '  ·  ' + state.passed + ' tests passed' +
    (state.failed ? ', ' + state.failed + ' failed' : '') +
    '  ·  ' + state.assertions + ' assertions'
  );
  console.log(line + '\n');
  return state.failed === 0;
}

module.exports = {
  suite: suite,
  test: test,
  ok: ok,
  notOk: notOk,
  equal: equal,
  notEqual: notEqual,
  close: close,
  deepEqual: deepEqual,
  throws: throws,
  matches: matches,
  includes: includes,
  report: report,
  stats: function () {
    return { passed: state.passed, failed: state.failed, assertions: state.assertions };
  }
};
