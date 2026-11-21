/* ===================================================
   CA Practice Hub – directory page controller
   Search, category/access/kind filters, favourites
   and the compare tray (up to 3 tools). All state
   lives in localStorage; nothing leaves the browser.
   =================================================== */
(function () {
  'use strict';

  var H = window.TMHub;
  if (!H) return;

  var FAV_KEY = 'tm-cahub-favourites';
  var COMPARE_KEY = 'tm-cahub-compare';
  var MAX_COMPARE = 3;

  var state = {
    query: '',
    category: 'all',
    accessClass: 'all',
    kind: 'all',
    sort: 'name',
    favouritesOnly: false
  };

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
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full/blocked */ }
  }

  function favourites() { return readJSON(FAV_KEY, []); }
  function compareTray() { return readJSON(COMPARE_KEY, []); }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function accessBadge(tool) {
    var ac = H.accessLabel(tool.accessClass);
    return '<span class="badge access-' + esc(tool.accessClass) + '" title="' + esc(ac.description) + '">' + esc(ac.label) + '</span>';
  }

  function verificationBadge(tool) {
    var label = H.verificationLabel(tool.verificationStatus);
    var cls = tool.verificationStatus === 'github-verified' ? 'ver-ok'
      : tool.verificationStatus === 'official-source-linked' ? 'ver-official' : 'ver-check';
    return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
  }

  function cardHTML(tool) {
    var fav = favourites().indexOf(tool.id) !== -1;
    var inTray = compareTray().indexOf(tool.id) !== -1;
    var stars = typeof tool.stars === 'number'
      ? '<span class="tag stars">★ ' + esc(tool.stars >= 1000 ? (tool.stars / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : tool.stars) + '</span>' : '';
    var links = '';
    if (tool.githubUrl) links += '<a href="' + esc(tool.githubUrl) + '" target="_blank" rel="noopener">GitHub ↗</a>';
    if (tool.officialDocsUrl) links += '<a href="' + esc(tool.officialDocsUrl) + '" target="_blank" rel="noopener">Official docs ↗</a>';
    if (tool.homepageUrl) links += '<a href="' + esc(tool.homepageUrl) + '" target="_blank" rel="noopener">Website ↗</a>';
    return '<article class="hub-card" data-id="' + esc(tool.id) + '">' +
      '<header><h3><a href="ca-hub-tool.html?id=' + esc(tool.id) + '">' + esc(tool.name) + '</a></h3>' +
      '<button type="button" class="fav-btn' + (fav ? ' active' : '') + '" data-fav="' + esc(tool.id) + '" aria-pressed="' + (fav ? 'true' : 'false') + '" title="Save to favourites" aria-label="Save ' + esc(tool.name) + ' to favourites">' + (fav ? '★' : '☆') + '</button></header>' +
      '<p class="hub-sub">' + esc(H.categoryLabel(tool.category)) + ' · ' + esc(tool.subcategory) + ' · ' + esc(tool.provider) + '</p>' +
      '<p>' + esc(tool.summary) + '</p>' +
      '<div class="hub-badges">' + accessBadge(tool) + verificationBadge(tool) +
      '<span class="tag">' + esc(H.kindLabel(tool.kind)) + '</span>' +
      '<span class="tag">' + esc(tool.license) + '</span>' + stars + '</div>' +
      '<p class="hub-checked">Last checked: ' + esc(tool.lastVerifiedAt) + '</p>' +
      '<div class="hub-actions">' +
      '<a class="btn-mini" href="ca-hub-tool.html?id=' + esc(tool.id) + '">Details →</a>' +
      '<button type="button" class="btn-mini compare-btn' + (inTray ? ' active' : '') + '" data-compare="' + esc(tool.id) + '" aria-pressed="' + (inTray ? 'true' : 'false') + '">' + (inTray ? '✓ In compare' : '+ Compare') + '</button>' +
      '</div>' +
      (links ? '<div class="hub-links">' + links + '</div>' : '') +
      '</article>';
  }

  function renderHighlights() {
    var featuredHost = document.getElementById('featuredTools');
    var recentHost = document.getElementById('recentTools');
    var reminderHost = document.getElementById('reminderList');
    var featuredIds = ['eri-apis', 'einvoice-sandbox', 'apisetu'];
    if (featuredHost) {
      featuredHost.innerHTML = featuredIds.map(function (id) {
        var tool = H.getById(id);
        if (!tool) return '';
        return '<article class="highlight-item"><a href="ca-hub-tool.html?id=' + esc(tool.id) + '">' + esc(tool.name) + '</a>' +
          '<p>' + esc(H.accessLabel(tool.accessClass).label) + ' · checked ' + esc(tool.lastVerifiedAt) + '</p></article>';
      }).join('');
    }
    if (recentHost) {
      var recent = H.TOOLS.slice().sort(function (a, b) {
        return b.lastVerifiedAt.localeCompare(a.lastVerifiedAt) || a.name.localeCompare(b.name);
      }).slice(0, 4);
      recentHost.innerHTML = recent.map(function (tool) {
        return '<article class="highlight-item"><a href="ca-hub-tool.html?id=' + esc(tool.id) + '">' + esc(tool.name) + '</a>' +
          '<p>Checked ' + esc(tool.lastVerifiedAt) + ' · ' + esc(H.verificationLabel(tool.verificationStatus)) + '</p></article>';
      }).join('');
    }
    if (reminderHost) {
      var dates = H.nextDueDates(new Date(), 45).slice(0, 4);
      reminderHost.innerHTML = dates.length ? dates.map(function (item) {
        return '<div class="reminder-item"><span>' + esc(item.label) + '</span><time datetime="' + esc(item.date) + '">' + esc(item.date) + '</time></div>';
      }).join('') : '<p class="sub">No rule-based reminders in the next 45 days.</p>';
    }
  }

  function renderChips() {
    var host = document.getElementById('categoryChips');
    if (!host) return;
    host.innerHTML = H.categoriesWithCounts().map(function (c) {
      return '<button type="button" data-category="' + esc(c.id) + '" class="' + (state.category === c.id ? 'active' : '') + '">' +
        esc(c.label) + ' <span style="opacity:0.6">' + c.count + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('[data-category]'), function (btn) {
      btn.addEventListener('click', function () {
        state.category = btn.getAttribute('data-category');
        renderChips();
        render();
      });
    });
  }

  function renderAccessOptions() {
    var select = document.getElementById('accessFilter');
    if (!select) return;
    select.innerHTML = '<option value="all">Any access class</option>' + H.accessCounts().map(function (ac) {
      return '<option value="' + esc(ac.id) + '">' + esc(ac.label) + ' (' + ac.count + ')</option>';
    }).join('');
    select.value = state.accessClass;
  }

  function renderKindOptions() {
    var select = document.getElementById('kindFilter');
    if (!select) return;
    select.innerHTML = H.kindCounts().map(function (k) {
      return '<option value="' + esc(k.id) + '">' + esc(k.label) + ' (' + k.count + ')</option>';
    }).join('');
    select.value = state.kind;
  }

  function renderTray() {
    var tray = document.getElementById('compareTray');
    var bar = document.getElementById('compareBar');
    if (!tray || !bar) return;
    var ids = compareTray();
    bar.hidden = ids.length === 0;
    if (!ids.length) return;
    tray.innerHTML = ids.map(function (id) {
      var tool = H.getById(id);
      if (!tool) return '';
      return '<span class="tray-chip">' + esc(tool.name) +
        ' <button type="button" data-remove="' + esc(id) + '" aria-label="Remove ' + esc(tool.name) + ' from compare">✕</button></span>';
    }).join('') +
      '<a class="btn-mini primary" href="ca-hub-compare.html">Compare ' + ids.length + ' tool' + (ids.length > 1 ? 's' : '') + ' →</a>' +
      '<button type="button" class="btn-mini" id="clearCompare">Clear</button>';
    Array.prototype.forEach.call(tray.querySelectorAll('[data-remove]'), function (btn) {
      btn.addEventListener('click', function () {
        writeJSON(COMPARE_KEY, compareTray().filter(function (id) { return id !== btn.getAttribute('data-remove'); }));
        render();
      });
    });
    var clear = document.getElementById('clearCompare');
    if (clear) clear.addEventListener('click', function () {
      writeJSON(COMPARE_KEY, []);
      render();
    });
  }

  function render() {
    var results = H.search({
      query: state.query,
      category: state.category,
      accessClass: state.accessClass,
      kind: state.kind,
      sort: state.sort,
      favouritesOnly: state.favouritesOnly,
      favouriteIds: favourites()
    });
    var grid = document.getElementById('hubGrid');
    var empty = document.getElementById('emptyState');
    var count = document.getElementById('resultCount');
    if (!grid) return;
    grid.innerHTML = results.map(cardHTML).join('');
    if (empty) empty.hidden = results.length > 0;
    if (count) {
      count.textContent = 'Showing ' + results.length + ' of ' + H.TOOLS.length + ' curated entries' +
        (state.favouritesOnly ? ' (favourites only)' : '');
    }
    Array.prototype.forEach.call(grid.querySelectorAll('[data-fav]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-fav');
        var favs = favourites();
        var idx = favs.indexOf(id);
        if (idx === -1) favs.push(id); else favs.splice(idx, 1);
        writeJSON(FAV_KEY, favs);
        render();
      });
    });
    Array.prototype.forEach.call(grid.querySelectorAll('[data-compare]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-compare');
        var tray = compareTray();
        var idx = tray.indexOf(id);
        if (idx !== -1) {
          tray.splice(idx, 1);
        } else {
          if (tray.length >= MAX_COMPARE) {
            toast('Compare holds up to ' + MAX_COMPARE + ' tools. Remove one first.');
            return;
          }
          tray.push(id);
        }
        writeJSON(COMPARE_KEY, tray);
        render();
      });
    });
    renderTray();
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
    var verified = document.getElementById('verifiedOn');
    if (verified) verified.textContent = H.VERIFIED_ON;
    var total = document.getElementById('hubTotal');
    if (total) total.textContent = String(H.TOOLS.length);

    renderHighlights();
    renderChips();
    renderAccessOptions();
    renderKindOptions();

    var searchInput = document.getElementById('hubSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        state.query = searchInput.value;
        render();
      });
    }
    var access = document.getElementById('accessFilter');
    if (access) access.addEventListener('change', function () { state.accessClass = access.value; render(); });
    var kind = document.getElementById('kindFilter');
    if (kind) kind.addEventListener('change', function () { state.kind = kind.value; render(); });
    var sort = document.getElementById('sortBy');
    if (sort) sort.addEventListener('change', function () { state.sort = sort.value; render(); });
    var favToggle = document.getElementById('favToggle');
    if (favToggle) favToggle.addEventListener('change', function () {
      state.favouritesOnly = favToggle.checked;
      render();
    });

    // Deep-link: ?q=, ?category=, ?access=
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('q') && searchInput) { searchInput.value = params.get('q'); state.query = params.get('q'); }
      if (params.get('category')) state.category = params.get('category');
      if (params.get('access')) state.accessClass = params.get('access');
      renderChips();
      renderAccessOptions();
      renderKindOptions();
    } catch (e) { /* URLSearchParams unavailable */ }

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
