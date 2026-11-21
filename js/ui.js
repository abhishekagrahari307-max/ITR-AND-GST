/* ================================================================
   TaxMitra — interface behaviours (v5)

   Everything here is progressive enhancement. Without this file the
   pages work exactly as before: nothing is hidden by CSS until this
   script adds `tm-motion` to <html>.

   Implemented:
     • reading-progress bar and back-to-top control
     • sticky header elevation
     • reveal-on-scroll for cards (opt-out with .no-reveal)
     • table overflow wrappers with a shadow hint
     • mobile drawer scrim + body scroll lock (drawer itself is in taxmitra.js)
     • small count-up on KPI numbers
   ================================================================ */

(function () {
  'use strict';

  if (typeof document === 'undefined') return;

  var root = document.documentElement;
  var reduceMotion = false;

  try {
    reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (error) {
    reduceMotion = false;
  }

  var supportsObserver = typeof window.IntersectionObserver === 'function';

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) Object.keys(attrs).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }

  /* ---------------------------------------------------- progress */

  function mountProgress() {
    if (reduceMotion) return;
    var bar = el('div', 'tm-progress', { 'aria-hidden': 'true' });
    document.body.appendChild(bar);

    var queued = false;
    function paint() {
      queued = false;
      var doc = document.documentElement;
      var scrollable = (doc.scrollHeight || 0) - (window.innerHeight || 0);
      var ratio = scrollable > 0 ? Math.min(1, Math.max(0, (window.pageYOffset || doc.scrollTop || 0) / scrollable)) : 0;
      bar.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
    }
    function request() {
      if (queued) return;
      queued = true;
      if (window.requestAnimationFrame) window.requestAnimationFrame(paint);
      else setTimeout(paint, 16);
    }
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
    paint();
  }

  /* --------------------------------------------------- back to top */

  function mountBackToTop() {
    var button = el('button', 'tm-top', {
      type: 'button',
      'aria-label': 'Back to top',
      title: 'Back to top',
    });
    button.innerHTML = '↑';
    document.body.appendChild(button);

    var queued = false;
    function toggle() {
      queued = false;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      if (y > 520) button.classList.add('is-visible');
      else button.classList.remove('is-visible');
    }
    function request() {
      if (queued) return;
      queued = true;
      if (window.requestAnimationFrame) window.requestAnimationFrame(toggle);
      else setTimeout(toggle, 16);
    }

    button.addEventListener('click', function () {
      try {
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      } catch (error) {
        window.scrollTo(0, 0);
      }
    });

    window.addEventListener('scroll', request, { passive: true });
    toggle();
  }

  /* ------------------------------------------------- sticky header */

  function mountStickyHeader() {
    var bar = document.querySelector('.navbar-main');
    if (!bar) return;
    var queued = false;
    function paint() {
      queued = false;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      bar.classList.toggle('is-stuck', y > 6);
    }
    function request() {
      if (queued) return;
      queued = true;
      if (window.requestAnimationFrame) window.requestAnimationFrame(paint);
      else setTimeout(paint, 16);
    }
    window.addEventListener('scroll', request, { passive: true });
    paint();
  }

  /* ------------------------------------------------------ reveals */

  var REVEAL_SELECTOR = [
    '.card', '.form-card', '.result-card', '.module-card', '.guide-card',
    '.kpi', '.stat-card', '.cloud-card', '.admin-card', '.result-item',
    '.checklist-item', '.section-title'
  ].join(',');

  function isSharedShell() {
    return !!(document.body && document.body.classList.contains('tm-ui'));
  }

  function mountReveals() {
    // Only the shared shell opts into motion; pages with their own theme
    // (the dark tools directory, the classic print form) are left untouched.
    if (reduceMotion || !supportsObserver || !isSharedShell()) return;
    var nodes = Array.prototype.slice.call(document.querySelectorAll(REVEAL_SELECTOR));
    if (!nodes.length) return;

    var pending = [];
    nodes.forEach(function (node) {
      // never animate inside an already-visible hero or a hidden panel
      if (node.closest('.page-hero') || node.closest('[hidden]') || node.classList.contains('no-reveal')) return;
      if (node.classList.contains('tm-reveal')) return;
      node.classList.add('tm-reveal');
      pending.push(node);
    });
    if (!pending.length) return;

    root.classList.add('tm-motion');

    var observer = new window.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
        var index = pending.indexOf(entry.target);
        if (index !== -1) pending.splice(index, 1);
        countUp(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    pending.forEach(function (node) { observer.observe(node); });

    // Safety nets: near-the-fold content reveals even if the observer stays
    // quiet, and anything left after a few seconds is revealed regardless, so
    // copy can never be stuck invisible.
    function sweep(limit) {
      pending.slice().forEach(function (node) {
        var rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
        if (limit && rect && rect.top > limit) return;
        node.classList.add('is-in');
        var index = pending.indexOf(node);
        if (index !== -1) pending.splice(index, 1);
      });
    }
    setTimeout(function () { sweep((window.innerHeight || 700) * 2); }, 1200);
    setTimeout(function () { sweep(0); }, 6000);
  }

  /* ----------------------------------------------------- count-up */

  function countUp(scope) {
    if (reduceMotion) return;
    var targets = scope.querySelectorAll('.kpi-value, .stat-value, [data-count]');
    Array.prototype.forEach.call(targets, function (node) {
      if (node.dataset.counted === '1') return;
      var raw = (node.textContent || '').trim();
      if (!/^\d{1,7}$/.test(raw)) return;              // "—", "1,240", "12%" stay untouched
      var end = parseInt(raw, 10);
      if (!isFinite(end) || end < 4) return;
      node.dataset.counted = '1';
      var started = null;
      var duration = 620;

      function frame(now) {
        if (started === null) started = now;
        var progress = Math.min(1, (now - started) / duration);
        var eased = 1 - Math.pow(1 - progress, 3);
        node.textContent = String(Math.round(end * eased));
        if (progress < 1 && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(frame);
        } else {
          node.textContent = String(end);
        }
      }
      var start = parseInt(node.textContent, 10) || 0;
      if (start === end) return;
      node.textContent = '0';
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(frame);
      else node.textContent = String(end);
    });
  }

  /* ------------------------------------------------------- tables */

  function mountTables() {
    var tables = document.querySelectorAll('table');
    Array.prototype.forEach.call(tables, function (table) {
      if (table.parentElement && table.parentElement.classList.contains('tm-table-scroll')) return;
      if (table.closest('.table-wrap')) return;         // page already handles overflow
      if (table.classList.contains('no-scroll')) return;

      var wrap = el('div', 'tm-table-scroll');
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);

      function hint() {
        var overflow = wrap.scrollWidth - wrap.clientWidth > 4;
        wrap.classList.toggle('is-scrollable', overflow);
      }
      hint();
      window.addEventListener('resize', hint, { passive: true });
    });
  }

  /* ------------------------------------------- mobile drawer scrim */

  function mountDrawer() {
    var wrapper = document.getElementById('navLinksWrapper');
    var hamburger = document.getElementById('hamburger');
    if (!wrapper || !hamburger) return;

    var scrim = el('div', 'tm-scrim', { 'aria-hidden': 'true' });
    document.body.appendChild(scrim);

    var bar = document.querySelector('.navbar-main');

    // The announcement bar can sit above the header, so the drawer starts at
    // the header's real bottom edge rather than a hardcoded offset.
    function positionDrawer() {
      if (!bar || !bar.getBoundingClientRect) return;
      var bottom = Math.max(0, Math.round(bar.getBoundingClientRect().bottom));
      wrapper.style.setProperty('--tm-drawer-top', bottom + 'px');
    }

    function sync() {
      var open = wrapper.classList.contains('show');
      if (open) positionDrawer();
      scrim.classList.toggle('is-open', open);
      document.body.classList.toggle('tm-nav-open', open);
      hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    window.addEventListener('resize', function () {
      if (wrapper.classList.contains('show')) positionDrawer();
    }, { passive: true });
    window.addEventListener('scroll', function () {
      if (wrapper.classList.contains('show')) positionDrawer();
    }, { passive: true });

    scrim.addEventListener('click', function () { hamburger.click(); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && wrapper.classList.contains('show')) hamburger.click();
    });

    if (typeof window.MutationObserver === 'function') {
      new window.MutationObserver(sync).observe(wrapper, { attributes: true, attributeFilter: ['class'] });
    } else {
      hamburger.addEventListener('click', function () { setTimeout(sync, 0); });
    }
    sync();
  }

  /* --------------------------------------------------------- start */

  onReady(function () {
    try {
      mountProgress();
      mountBackToTop();
      mountStickyHeader();
      mountTables();
      mountDrawer();
      mountReveals();
    } catch (error) {
      // A visual extra must never break a page.
      if (window.console && console.warn) console.warn('[ui] skipped an enhancement:', error && error.message);
    }
  });
})();
