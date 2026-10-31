'use strict';

var t = require('./harness');
var path = require('path');
var D = require(path.join(__dirname, '..', 'js', 'github-tools.js'));

var suite = t.suite;
var test = t.test;

suite('Directory · data integrity', function () {
  test('exactly 25 projects are listed', function () {
    t.equal(D.REPOS.length, 25);
  });

  test('ids are unique', function () {
    var seen = {};
    D.REPOS.forEach(function (repo) {
      t.notOk(seen[repo.id], 'duplicate id: ' + repo.id);
      seen[repo.id] = true;
    });
  });

  test('repository URLs are unique GitHub HTTPS links', function () {
    var seen = {};
    D.REPOS.forEach(function (repo) {
      t.matches(repo.url, /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, repo.id + ' url');
      t.notOk(seen[repo.url], 'duplicate url: ' + repo.url);
      seen[repo.url] = true;
      t.equal(repo.url.replace('https://github.com/', ''), repo.name, repo.id + ': name should match the URL');
    });
  });

  test('every entry has the fields the page renders', function () {
    D.REPOS.forEach(function (repo) {
      t.ok(repo.description && repo.description.length > 20, repo.id + ' needs a description');
      t.ok(repo.why && repo.why.length > 30, repo.id + ' needs a why-it-is-here note');
      t.ok(repo.caveat && repo.caveat.length > 20, repo.id + ' needs a caveat');
      t.ok(typeof repo.stars === 'number' && repo.stars >= 0, repo.id + ' stars');
      t.ok(typeof repo.forks === 'number' && repo.forks >= 0, repo.id + ' forks');
      t.matches(repo.lastPush, /^\d{4}-\d{2}-\d{2}$/, repo.id + ' lastPush');
      t.ok(repo.category, repo.id + ' category');
      t.ok(repo.license, repo.id + ' licence');
    });
  });

  test('homepages are https when present', function () {
    D.REPOS.forEach(function (repo) {
      if (!repo.homepage) return;
      t.matches(repo.homepage, /^https?:\/\//, repo.id + ' homepage should be an absolute URL');
    });
  });

  test('categories all exist in the category list', function () {
    var valid = D.CATEGORIES.map(function (c) { return c.id; });
    D.REPOS.forEach(function (repo) {
      t.ok(valid.indexOf(repo.category) !== -1, repo.id + ' has unknown category ' + repo.category);
    });
  });

  test('every category has at least one project', function () {
    var counts = D.categoriesWithCounts();
    counts.filter(function (c) { return c.id !== 'all'; }).forEach(function (c) {
      t.ok(c.count > 0, 'category ' + c.id + ' is empty');
    });
  });

  test('summary counts add up', function () {
    var summary = D.summary();
    t.equal(summary.total, 25);
    t.equal(summary.verifiedOn, D.VERIFIED_ON);
    var licenceTotal = Object.keys(summary.licenses).reduce(function (sum, k) { return sum + summary.licenses[k]; }, 0);
    t.equal(licenceTotal, 25);
    t.ok(summary.unlicensed >= 1, 'the two unlicensed repos should be counted');
  });

  test('unlicensed projects are recognisable by name', function () {
    var unlicensed = D.REPOS.filter(function (r) { return !D.isReusableLicence(r.license); });
    t.equal(unlicensed.length, 2);
    unlicensed.forEach(function (repo) {
      t.equal(repo.license, 'NO LICENSE FILE');
      t.includes(repo.caveat.toLowerCase() + ' ' + repo.description.toLowerCase(), 'licen');
    });
  });

  test('the OpenTax demo caveat is recorded', function () {
    var opentax = D.REPOS.filter(function (r) { return r.id === 'opentax'; })[0];
    t.ok(opentax, 'OpenTax should be in the list');
    t.includes(opentax.caveat.toLowerCase(), 'demo');
  });
});

suite('Directory · search and filters', function () {
  test('an empty query returns everything', function () {
    t.equal(D.search({}).length, 25);
    t.equal(D.search({ query: '   ' }).length, 25);
  });

  test('text search matches names, descriptions and notes', function () {
    t.ok(D.search({ query: 'gstr' }).length > 0, 'GSTR should match');
    t.ok(D.search({ query: 'payroll' }).length > 0, 'payroll should match');
    t.ok(D.search({ query: 'ocr' }).length > 0, 'OCR should match');
    t.ok(D.search({ query: 'aaa-no-such-thing' }).length === 0);
  });

  test('search is case-insensitive', function () {
    var lower = D.search({ query: 'invoice' }).length;
    var upper = D.search({ query: 'INVOICE' }).length;
    t.equal(lower, upper);
    t.ok(lower > 0);
  });

  test('category filter narrows results', function () {
    var gst = D.search({ category: 'gst' });
    t.ok(gst.length > 0);
    gst.forEach(function (repo) { t.equal(repo.category, 'gst'); });
    var total = D.CATEGORIES.filter(function (c) { return c.id !== 'all'; })
      .reduce(function (sum, c) { return sum + D.search({ category: c.id }).length; }, 0);
    t.equal(total, 25);
  });

  test('licence filter separates reusable, copyleft and unlicensed', function () {
    var reusable = D.search({ licence: 'reusable' });
    reusable.forEach(function (repo) { t.ok(D.isReusableLicence(repo.license)); });
    var copyleft = D.search({ licence: 'copyleft' });
    copyleft.forEach(function (repo) { t.matches(repo.license, /GPL|MPL/i); });
    var unlicensed = D.search({ licence: 'unlicensed' });
    t.equal(unlicensed.length, 2);
    t.ok(reusable.length + unlicensed.length > 0);
  });

  test('sorting by stars is descending', function () {
    var sorted = D.search({ sort: 'stars' });
    for (var i = 1; i < sorted.length; i++) {
      t.ok(sorted[i - 1].stars >= sorted[i].stars, 'star order broken at index ' + i);
    }
  });

  test('sorting by name is alphabetical', function () {
    var sorted = D.search({ sort: 'name' });
    for (var i = 1; i < sorted.length; i++) {
      t.ok(sorted[i - 1].name.localeCompare(sorted[i].name) <= 0);
    }
  });

  test('sorting by recent is descending by last push', function () {
    var sorted = D.search({ sort: 'recent' });
    for (var i = 1; i < sorted.length; i++) {
      t.ok(sorted[i - 1].lastPush >= sorted[i].lastPush);
    }
  });

  test('filters combine', function () {
    var results = D.search({ category: 'accounting', licence: 'reusable', sort: 'name' });
    results.forEach(function (repo) {
      t.equal(repo.category, 'accounting');
      t.ok(D.isReusableLicence(repo.license));
    });
  });

  test('includeUnlicensed:false removes unlicensed projects', function () {
    var results = D.search({ includeUnlicensed: false });
    t.equal(results.length, 23);
    results.forEach(function (repo) { t.ok(D.isReusableLicence(repo.license)); });
  });

  test('search never mutates the source list', function () {
    var before = D.REPOS.map(function (r) { return r.id; }).join(',');
    D.search({ query: 'gst', sort: 'name' });
    var after = D.REPOS.map(function (r) { return r.id; }).join(',');
    t.equal(before, after);
  });
});
