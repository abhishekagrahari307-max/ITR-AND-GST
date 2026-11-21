'use strict';

/* Guards for the shared interface layer (css/ui.css + js/ui.js).
   These are cheap, structural checks: they stop a page from silently
   losing the stylesheet, and stop the sheet from growing an external
   dependency or a blanket !important habit. */

var t = require('./harness');
var path = require('path');
var fs = require('fs');

var suite = t.suite;
var test = t.test;
var ROOT = path.join(__dirname, '..');

var CSS = fs.readFileSync(path.join(ROOT, 'css', 'ui.css'), 'utf8');
var JS = fs.readFileSync(path.join(ROOT, 'js', 'ui.js'), 'utf8');

function htmlFiles() {
  var files = fs.readdirSync(ROOT).filter(function (f) { return f.endsWith('.html'); });
  fs.readdirSync(path.join(ROOT, 'pages'))
    .filter(function (f) { return f.endsWith('.html'); })
    .forEach(function (f) { files.push('pages/' + f); });
  return files.sort();
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

var OWN_THEME_PAGES = ['pages/index.html', 'pages/itr-form-classic.html'];

suite('UI · every page loads the interface layer once', function () {
  htmlFiles().forEach(function (file) {
    test(file + ' links css/ui.css and js/ui.js exactly once', function () {
      var html = read(file);
      var css = (html.match(/css\/ui\.css/g) || []).length;
      var js = (html.match(/js\/ui\.js/g) || []).length;
      t.equal(css, 1, file + ' should link css/ui.css once, found ' + css);
      t.equal(js, 1, file + ' should load js/ui.js once, found ' + js);
    });

    test(file + ' opts into the shared shell unless it owns its theme', function () {
      var html = read(file);
      var optedIn = /<body[^>]*class="[^"]*\btm-ui\b/.test(html);
      if (OWN_THEME_PAGES.indexOf(file) !== -1) {
        t.notOk(optedIn, file + ' owns its theme and must not be restyled by ui.css');
      } else {
        t.ok(optedIn, file + ' should have <body class="tm-ui">');
      }
    });
  });
});

suite('UI · stylesheet stays self-contained', function () {
  test('no remote imports, fonts or images', function () {
    t.notOk(/@import/.test(CSS), 'ui.css must not @import anything');
    t.notOk(/url\(\s*['"]?https?:/i.test(CSS), 'ui.css must not fetch remote assets');
  });

  test('important is used only for reduced motion and print', function () {
    var stripped = CSS
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}\n/, '')
      .replace(/@media print[\s\S]*$/, '');
    var offenders = stripped.split('\n').filter(function (line) { return line.indexOf('!important') !== -1; });
    t.equal(offenders.length, 0, 'unexpected !important: ' + offenders.join(' | '));
  });

  test('motion is opt-in and can be switched off', function () {
    t.includes(CSS, 'html.tm-motion .tm-reveal', 'reveal styles must be gated on html.tm-motion');
    t.includes(CSS, 'prefers-reduced-motion: reduce', 'a reduced-motion block is required');
  });

  test('dark mode is a colour swap, not a separate layout', function () {
    t.includes(CSS, 'body.tm-ui.dark-mode', 'dark tokens must come from body.tm-ui.dark-mode');
    t.includes(CSS, 'color-scheme: dark', 'dark mode should advertise color-scheme');
  });

  test('the responsive ladder is present', function () {
    [1100, 1024, 860, 640, 420].forEach(function (width) {
      t.includes(CSS, 'max-width: ' + width + 'px', 'missing breakpoint at ' + width + 'px');
    });
    t.includes(CSS, 'min-width: 1600px', 'large screens need a cap');
  });

  test('touch targets and focus states are defined', function () {
    t.includes(CSS, 'min-height: 42px', 'inputs need a comfortable touch height');
    t.includes(CSS, ':focus-visible', 'keyboard focus must be visible');
  });
});

suite('UI · behaviours are progressive', function () {
  test('nothing is hidden until the script opts in', function () {
    t.includes(JS, "classList.add('tm-motion')", 'the script must add the motion class itself');
  });

  test('reveals are skipped for pages that own their theme', function () {
    t.includes(JS, "contains('tm-ui')", 'reveal logic must check for the shared shell');
  });

  test('content is forced visible as a safety net', function () {
    t.includes(JS, 'function sweep(', 'a sweep must reveal anything the observer missed');
    t.ok(/setTimeout\(\s*function \(\) \{ sweep\(/.test(JS), 'the sweep must run on a timer, not only on scroll');
    t.includes(JS, '6000', 'a final fallback must reveal everything, however late');
  });

  test('the script never throws without a browser', function () {
    t.notOk(/document\.body\.appendChild/.test(JS) && JS.indexOf('onReady') === -1,
      'DOM work must run after the document is ready');
    t.includes(JS, 'try {', 'enhancements must be wrapped so a failure cannot break a page');
  });
});
