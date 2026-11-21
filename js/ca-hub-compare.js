/* ===================================================
   CA Practice Hub – comparison page controller
   Compares up to 3 tools side-by-side by workflow
   and feature. No "best" ranking is claimed.
   Sources: ?ids=a,b,c or the compare tray in
   localStorage (tm-cahub-compare).
   =================================================== */
(function () {
  'use strict';

  var H = window.TMHub;
  if (!H) return;

  var COMPARE_KEY = 'tm-cahub-compare';
  var MAX = 3;

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function readTray() {
    try {
      var raw = window.localStorage.getItem(COMPARE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeTray(ids) {
    try { window.localStorage.setItem(COMPARE_KEY, JSON.stringify(ids)); } catch (e) { /* blocked */ }
  }

  function idsFromURL() {
    try {
      var raw = new URLSearchParams(window.location.search).get('ids') || '';
      return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function init() {
    var fromURL = idsFromURL();
    var ids = fromURL.length ? fromURL : readTray();
    ids = ids.filter(function (id, idx) { return ids.indexOf(id) === idx; }).slice(0, MAX);

    var picker = document.getElementById('comparePicker');
    if (picker) {
      picker.innerHTML = '<option value="">Add a tool…</option>' + H.TOOLS.map(function (tool) {
        return '<option value="' + esc(tool.id) + '"' + (ids.indexOf(tool.id) !== -1 ? ' disabled' : '') + '>' + esc(tool.name) + '</option>';
      }).join('');
      picker.addEventListener('change', function () {
        if (!picker.value) return;
        if (ids.length >= MAX) return;
        ids.push(picker.value);
        writeTray(ids);
        render(ids);
      });
    }

    var printBtn = document.getElementById('printCompare');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

    var clearBtn = document.getElementById('clearCompare');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      ids = [];
      writeTray(ids);
      render(ids);
    });

    render(ids);
  }

  function render(ids) {
    var result = H.compare(ids);
    var host = document.getElementById('compareHost');
    var empty = document.getElementById('compareEmpty');
    var count = document.getElementById('compareCount');
    if (!host) return;

    if (count) count.textContent = result.tools.length + ' of ' + MAX + ' tools selected';
    if (empty) empty.hidden = result.tools.length > 0;

    if (!result.tools.length) {
      host.innerHTML = '';
      return;
    }

    var head = '<tr><th scope="col">Field</th>' + result.tools.map(function (tool) {
      return '<th scope="col"><a href="ca-hub-tool.html?id=' + esc(tool.id) + '">' + esc(tool.name) + '</a>' +
        '<br><span class="badge access-' + esc(tool.accessClass) + '">' + esc(H.accessLabel(tool.accessClass).label) + '</span>' +
        '<br><button type="button" class="btn-mini" data-remove="' + esc(tool.id) + '">Remove</button></th>';
    }).join('') + '</tr>';

    var rows = result.fields.map(function (field) {
      return '<tr><th scope="row">' + esc(field.label) + '</th>' +
        result.tools.map(function (tool) { return '<td>' + esc(field.get(tool)) + '</td>'; }).join('') + '</tr>';
    }).join('');

    host.innerHTML = '<table class="tm-table compare-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>' +
      '<p class="compare-note">Comparison is by workflow and feature only. This page does not rank tools as "best" – ' +
      'check the access class, limitations and last-checked date for your own situation.</p>';

    Array.prototype.forEach.call(host.querySelectorAll('[data-remove]'), function (btn) {
      btn.addEventListener('click', function () {
        var next = ids.filter(function (id) { return id !== btn.getAttribute('data-remove'); });
        writeTray(next);
        // Rebuild picker disabled state.
        var picker = document.getElementById('comparePicker');
        if (picker) {
          Array.prototype.forEach.call(picker.options, function (opt) { opt.disabled = next.indexOf(opt.value) !== -1; });
        }
        render(next);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
