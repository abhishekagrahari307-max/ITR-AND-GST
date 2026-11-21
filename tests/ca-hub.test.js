'use strict';

var t = require('./harness');
var suite = t.suite;
var test = t.test;
var Hub = require('../js/ca-hub.js');
var Workspace = require('../js/ca-workspace.js');
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');

suite('CA Hub · curated catalog integrity', function () {
  test('catalog has unique IDs and every entry has access, source, limitation and review date', function () {
    t.equal(Hub.TOOLS.length, 24);
    var ids = Hub.TOOLS.map(function (tool) { return tool.id; });
    t.equal(new Set(ids).size, ids.length);
    Hub.TOOLS.forEach(function (tool) {
      t.ok(tool.name, tool.id + ' needs a name');
      t.ok(tool.provider, tool.id + ' needs a provider');
      t.ok(Hub.ACCESS_CLASSES.some(function (ac) { return ac.id === tool.accessClass; }), tool.id + ' needs an access class');
      t.ok(Array.isArray(tool.sourceUrls) && tool.sourceUrls.length > 0, tool.id + ' needs at least one source URL');
      t.ok(tool.sourceUrls.every(function (url) { return /^https:\/\//.test(url); }), tool.id + ' source URLs must be HTTPS');
      t.ok(String(tool.limitations || '').trim().length > 10, tool.id + ' needs a useful limitation');
      t.matches(tool.lastVerifiedAt, /^\d{4}-\d{2}-\d{2}$/);
      t.ok(Hub.VERIFICATION_STATUSES.some(function (s) { return s.id === tool.verificationStatus; }), tool.id + ' needs a verification status');
      t.ok(tool.authMethod !== undefined && tool.approvalRequired !== undefined && tool.consentRequired !== undefined);
      t.ok(tool.productionStatus && tool.pricingNote !== undefined && tool.rateLimitNote !== undefined);
    });
  });

  test('unverified community entries are not promoted to verified', function () {
    Hub.TOOLS.filter(function (tool) { return tool.verificationStatus === 'curator-listed'; }).forEach(function (tool) {
      t.ok(tool.curatorNotes && tool.verificationStatus !== 'github-verified', tool.id + ' must not claim GitHub verification');
      if (tool.githubUrl) t.ok(/re-check|not re-verified|not verified/i.test(tool.limitations + ' ' + tool.curatorNotes), tool.id + ' must disclose that GitHub was not re-verified');
    });
    var eri = Hub.getById('eri-apis');
    t.equal(eri.accessClass, 'partner-eri');
    t.equal(eri.approvalRequired, true);
    t.equal(eri.consentRequired, true);
    var sandbox = Hub.getById('einvoice-sandbox');
    t.equal(sandbox.accessClass, 'sandbox-only');
    t.ok(/sandbox only/i.test(sandbox.productionStatus));
    t.ok(/sandbox/i.test(sandbox.limitations));
  });

  test('search, filters, related tools and comparison are deterministic', function () {
    t.equal(Hub.search({}).length, Hub.TOOLS.length);
    t.ok(Hub.search({ query: 'GSTR', category: 'gst' }).length > 0);
    t.equal(Hub.search({ query: 'this will not match anything' }).length, 0);
    t.ok(Hub.categoriesWithCounts().every(function (c) { return c.id === 'all' || c.count > 0; }));
    var tool = Hub.getById('eri-apis');
    t.ok(Hub.related(tool, 2).length > 0);
    var compare = Hub.compare(['eri-apis', 'apisetu', 'einvoice-sandbox', 'invalid']);
    t.equal(compare.tools.length, 3);
    t.ok(compare.fields.some(function (f) { return f.id === 'limitations'; }));
  });

  test('guides, updates and recurring deadlines provide usable records', function () {
    t.ok(Hub.GUIDES.length >= 5);
    Hub.GUIDES.forEach(function (guide) {
      t.ok(guide.title && guide.intro && guide.steps.length > 0);
      t.ok(guide.relatedToolIds.every(function (id) { return !!Hub.getById(id); }));
    });
    t.ok(Hub.UPDATES.length >= 3);
    var dates = Hub.nextDueDates(new Date('2026-11-21T00:00:00Z'), 60);
    t.ok(dates.length > 0);
    t.ok(dates.every(function (entry) { return /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && entry.note; }));
  });

  test('catalog contains no accidental credentials', function () {
    var text = JSON.stringify(Hub.TOOLS);
    t.notOk(/ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|client_secret\s*[:=]/i.test(text));
  });
});

suite('CA Hub workspace · local practice data', function () {
  test('workspace starts empty and normalisation tolerates corrupt storage', function () {
    t.deepEqual(Workspace.emptyStore(), { version: 2, tasks: [], activity: [] });
    t.deepEqual(Workspace.normaliseStore(null), Workspace.emptyStore());
    t.notOk(Object.prototype.hasOwnProperty.call(Workspace.normaliseStore({ clients: [{ id: 'legacy', name: 'Private client' }], tasks: [] }), 'clients'));
  });

  test('generic reminder store rejects invalid dates and does not retain legacy client records', function () {
    t.equal(Workspace.isISODate('2026-02-28'), true);
    t.equal(Workspace.isISODate('2026-02-31'), false);
    var store = Workspace.normaliseStore({ clients: [{ id: 'legacy', name: 'Private client' }], tasks: [], activity: [] });
    t.notOk(Object.prototype.hasOwnProperty.call(store, 'clients'));
    t.notOk(/Private client/.test(JSON.stringify(store)));
  });

  test('generic reminders store no client IDs, GSTIN, PAN or contact fields', function () {
    var store = Workspace.emptyStore();
    var added = Workspace.addTask(store, { title: 'Review monthly GST workflow', category: 'gst', dueDate: '2026-12-20' });
    t.equal(added.ok, true);
    ['clientId', 'gstin', 'pan', 'contact', 'notes'].forEach(function (field) { t.notOk(Object.prototype.hasOwnProperty.call(added.task, field)); });
    t.notOk(/Northwind|27AAPFU0939F1ZV/.test(JSON.stringify(store)));
  });

  test('engagement validation, workflow states, checklists and due-date stats work', function () {
    var store = Workspace.emptyStore();
    t.equal(Workspace.addTask(store, { title: '' }).ok, false);
    var a = Workspace.addTask(store, { title: 'Quarterly GST review', category: 'gst', dueDate: '2026-11-20' });
    var b = Workspace.addTask(store, { title: 'Prepare payroll reconciliation', category: 'payroll', dueDate: '2026-11-25' });
    t.equal(a.ok, true);
    t.equal(b.ok, true);
    t.equal(Workspace.isOverdue(a.task, '2026-11-21'), true);
    t.equal(Workspace.dueSoon(store.tasks, '2026-11-21', 7).length, 1);
    t.equal(Workspace.stats(store, '2026-11-21').overdue, 1);
    var first = a.task.checklist[0];
    t.equal(Workspace.toggleChecklistItem(store, a.task.id, first.id), true);
    t.equal(Workspace.checklistProgress(a.task).done, 1);
    t.equal(Workspace.updateTask(store, a.task.id, { status: 'done' }).ok, true);
    t.equal(Workspace.isOverdue(a.task, '2026-11-21'), false);
    t.equal(Workspace.deleteTask(store, b.task.id), true);
  });

  test('JSON backup round-trips and rejects malformed data', function () {
    var store = Workspace.emptyStore();
    Workspace.addTask(store, { title: 'Generic monthly tax workflow', category: 'gst' });
    var exported = Workspace.exportJSON(store);
    var imported = Workspace.importJSON(exported);
    t.equal(imported.ok, true);
    t.equal(imported.store.tasks.length, 1);
    t.notOk(/clients|GSTIN|PAN/i.test(exported));
    t.equal(Workspace.importJSON('{broken').ok, false);
    t.equal(Workspace.importJSON(JSON.stringify({ clients: [{ id: 'legacy', name: 'Do not import' }], tasks: [] })).ok, true);
    t.notOk(Object.prototype.hasOwnProperty.call(Workspace.importJSON(JSON.stringify({ clients: [{ id: 'legacy' }], tasks: [] })).store, 'clients'));
  });
});

suite('CA Hub pages · Phase 1 and local workspace', function () {
  test('all hub pages have complete documents and local scripts resolve', function () {
    ['ca-hub.html', 'ca-hub-tool.html', 'ca-hub-compare.html', 'ca-hub-guides.html', 'ca-hub-updates.html', 'ca-workspace.html', 'ca-hub-policy.html'].forEach(function (page) {
      var full = path.join(ROOT, 'pages', page);
      t.ok(fs.existsSync(full), page + ' is required');
      var html = fs.readFileSync(full, 'utf8');
      t.includes(html.toLowerCase(), '<!doctype html>');
      t.includes(html, 'name="viewport"');
      t.includes(html, '../css/taxmitra.css');
      t.includes(html, '../index.html');
      t.notOk(/ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|client_secret\s*[:=]/i.test(html));
      var ids = Array.from(html.matchAll(/\sid="([^"]+)"/g)).map(function (m) { return m[1]; });
      t.equal(new Set(ids).size, ids.length, page + ' contains duplicate IDs');
    });
  });

  test('reminder page rejects client-data use and starts empty', function () {
    var html = fs.readFileSync(path.join(ROOT, 'pages/ca-workspace.html'), 'utf8');
    t.includes(html, 'starts empty');
    t.includes(html, 'no account, team permissions, encryption');
    t.includes(html, 'Delete all reminder data');
    t.includes(html, 'Download JSON backup');
    t.includes(html, 'Do not enter client names');
    t.includes(html, 'does not satisfy a secure client-workspace requirement');
    t.notOk(html.indexOf('Client / business name') !== -1);
  });

  test('privacy/terms page publishes contact, deletion, privacy and terms', function () {
    var html = fs.readFileSync(path.join(ROOT, 'pages/ca-hub-policy.html'), 'utf8');
    ['id="privacy"', 'id="terms"', 'id="contact"', 'id="deletion"', 'GitHub repository issues'].forEach(function (phrase) { t.includes(html, phrase); });
  });
});
