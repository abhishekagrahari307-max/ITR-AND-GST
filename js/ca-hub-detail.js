/* ===================================================
   CA Practice Hub – tool detail page controller
   Renders one catalog entry from ?id=, plus related
   tools and a local "report an issue" form.
   =================================================== */
(function () {
  'use strict';

  var H = window.TMHub;
  if (!H) return;

  var REPORT_KEY = 'tm-cahub-reports';
  var COMPARE_KEY = 'tm-cahub-compare';

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* blocked */ }
  }

  function linkRow(label, url) {
    if (!url) return '';
    return '<tr><th scope="row">' + esc(label) + '</th><td><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + ' ↗</a></td></tr>';
  }

  function row(label, value) {
    if (value === undefined || value === null || value === '') return '';
    return '<tr><th scope="row">' + esc(label) + '</th><td>' + esc(value) + '</td></tr>';
  }

  function renderTool(tool) {
    var ac = H.accessLabel(tool.accessClass);
    var host = document.getElementById('toolDetail');
    if (!host) return;

    var useCases = (tool.useCases || []).map(function (u) { return '<li>' + esc(u) + '</li>'; }).join('');
    var sources = (tool.sourceUrls || []).map(function (u) {
      return '<li><a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + ' ↗</a></li>';
    }).join('');
    var related = H.related(tool, 3).map(function (other) {
      return '<li><a href="ca-hub-tool.html?id=' + esc(other.id) + '">' + esc(other.name) + '</a> — ' + esc(H.accessLabel(other.accessClass).label) + '</li>';
    }).join('');

    var githubStats = '';
    if (typeof tool.stars === 'number') {
      githubStats = row('GitHub signals (not proof of correctness)', '★ ' + tool.stars + ' · forks ' + tool.forks + ' · ' + (tool.language || '') + ' · last push ' + (tool.lastPush || ''));
    }

    host.innerHTML =
      '<div class="detail-head">' +
      '<p class="hub-sub">' + esc(H.categoryLabel(tool.category)) + ' · ' + esc(tool.subcategory) + '</p>' +
      '<h1>' + esc(tool.name) + '</h1>' +
      '<p class="detail-provider">Provider: ' + esc(tool.provider) + '</p>' +
      '<div class="hub-badges">' +
      '<span class="badge access-' + esc(tool.accessClass) + '" title="' + esc(ac.description) + '">' + esc(ac.label) + '</span>' +
      '<span class="badge ver-' + (tool.verificationStatus === 'github-verified' ? 'ok' : tool.verificationStatus === 'official-source-linked' ? 'official' : 'check') + '">' + esc(H.verificationLabel(tool.verificationStatus)) + '</span>' +
      '<span class="tag">' + esc(H.kindLabel(tool.kind)) + '</span>' +
      '</div>' +
      '<p class="hub-checked">Last checked: ' + esc(tool.lastVerifiedAt) + ' · ' + esc(H.verificationLabel(tool.verificationStatus)) + '</p>' +
      '</div>' +
      '<p class="detail-summary">' + esc(tool.summary) + '</p>' +
      '<div class="detail-actions">' +
      '<button type="button" class="btn-mini" id="addToCompare">+ Add to compare</button>' +
      '<button type="button" class="btn-mini" id="copyLink">Copy link</button>' +
      '<button type="button" class="btn-mini" id="printDetail">Print</button>' +
      '</div>' +
      '<h2>Use cases</h2><ul class="detail-list">' + useCases + '</ul>' +
      '<h2>Access &amp; production</h2>' +
      '<table class="tm-table"><thead><tr><th scope="col">Field</th><th scope="col">Detail</th></tr></thead><tbody>' +
      row('Access class', ac.label + ' — ' + ac.description) +
      row('Auth method', tool.authMethod) +
      row('Approval required', tool.approvalRequired ? 'Yes' : 'No') +
      row('Taxpayer consent required', tool.consentRequired ? 'Yes' : 'No') +
      row('Production status', tool.productionStatus) +
      row('Pricing', tool.pricingNote) +
      row('Rate limits', tool.rateLimitNote) +
      row('Data sensitivity', tool.dataSensitivity) +
      row('Supported forms / workflows', tool.supportedFormsOrWorkflows) +
      row('Licence / terms', tool.license) +
      githubStats +
      '</tbody></table>' +
      '<h2>Limitations</h2><p class="caveat-box">' + esc(tool.limitations) + '</p>' +
      '<h2>Links</h2>' +
      '<table class="tm-table"><thead><tr><th scope="col">Link</th><th scope="col">URL</th></tr></thead><tbody>' +
      linkRow('Official documentation', tool.officialDocsUrl) +
      linkRow('Homepage', tool.homepageUrl) +
      linkRow('GitHub repository', tool.githubUrl) +
      linkRow('Sandbox', tool.sandboxUrl) +
      '</tbody></table>' +
      '<h2>Sources</h2><ul class="detail-list">' + sources + '</ul>' +
      '<h2>Curator notes</h2><p>' + esc(tool.curatorNotes) + '</p>' +
      (related ? '<h2>Related in ' + esc(H.categoryLabel(tool.category)) + '</h2><ul class="detail-list">' + related + '</ul>' : '');

    var compareBtn = document.getElementById('addToCompare');
    if (compareBtn) compareBtn.addEventListener('click', function () {
      var tray = readJSON(COMPARE_KEY, []);
      if (tray.indexOf(tool.id) === -1) {
        if (tray.length >= 3) { toast('Compare holds up to 3 tools.'); return; }
        tray.push(tool.id);
        writeJSON(COMPARE_KEY, tray);
        compareBtn.textContent = '✓ In compare';
      }
      toast('Saved to compare tray. Open the directory to compare.');
    });
    var copyBtn = document.getElementById('copyLink');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { toast('Link copied.'); }, function () { toast('Copy failed – copy the address bar manually.'); });
      } else {
        toast('Copy not available – copy the address bar manually.');
      }
    });
    var printBtn = document.getElementById('printDetail');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
  }

  function toast(message) {
    var host = document.getElementById('toastHost');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'tm-toast info';
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  function init() {
    var id = '';
    try { id = new URLSearchParams(window.location.search).get('id') || ''; } catch (e) { /* ignore */ }
    var tool = H.getById(id);
    var notFound = document.getElementById('toolNotFound');
    if (!tool) {
      if (notFound) notFound.hidden = false;
      var host = document.getElementById('toolDetail');
      if (host) host.innerHTML = '';
      return;
    }
    if (notFound) notFound.hidden = true;
    document.title = tool.name + ' – CA Practice Hub India · TaxMitra';
    renderTool(tool);

    var form = document.getElementById('reportForm');
    if (form) form.addEventListener('submit', function (event) {
      event.preventDefault();
      var type = document.getElementById('reportType');
      var message = document.getElementById('reportMessage');
      var text = message ? String(message.value || '').trim() : '';
      if (!text) { toast('Please describe the issue first.'); return; }
      var reports = readJSON(REPORT_KEY, []);
      reports.unshift({
        id: 'report-' + Date.now().toString(36),
        toolId: tool.id,
        toolName: tool.name,
        type: type ? type.value : 'dead-link',
        message: text,
        at: new Date().toISOString()
      });
      writeJSON(REPORT_KEY, reports);
      form.reset();
      var status = document.getElementById('reportStatus');
      if (status) status.textContent = 'Saved in this browser (' + reports.length + ' report' + (reports.length > 1 ? 's' : '') + ' total). There is no server – please also email the maintainer with the same details.';
      toast('Report saved locally.');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
