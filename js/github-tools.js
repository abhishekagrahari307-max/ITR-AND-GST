/* ===================================================
   TaxMitra – Verified open-source directory
   Every entry below was checked against the GitHub REST API
   on VERIFIED_ON (stars, forks, licence, last push, archived
   flag all come from that check). Re-run the check before
   relying on the numbers – they drift.

   Honest labelling rules used here:
   * licence "NO LICENSE FILE" means default copyright applies –
     you may read the code, but you may not reuse it.
   * status "alpha"/"beta" is taken from the project's own README.
   * demo links are recorded but were NOT reachability-checked
     from the build environment (only github.com is reachable).
   =================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TMGitHubTools = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERIFIED_ON = '2026-10-31';

  var CATEGORIES = [
    { id: 'all', label: 'All' },
    { id: 'itr', label: 'ITR & income tax' },
    { id: 'gst', label: 'GST & billing' },
    { id: 'accounting', label: 'Accounting & ERP' },
    { id: 'payroll', label: 'Payroll & HR' },
    { id: 'documents', label: 'Documents & OCR' },
    { id: 'data', label: 'Reference data & utilities' }
  ];

  var REPOS = [
    {
      id: 'india-compliance',
      name: 'resilient-tech/india-compliance',
      url: 'https://github.com/resilient-tech/india-compliance',
      description: 'GST and compliance layer for ERPNext: GST returns, e-invoicing, e-way bill and India-specific statutory reports.',
      category: 'gst',
      license: 'GPL-3.0',
      stars: 278, forks: 292, language: 'Python', lastPush: '2026-10-30',
      homepage: 'https://indiacompliance.app',
      why: 'The most complete open-source Indian GST implementation if you already run ERPNext. Handles GSTR-1/3B/9, e-invoice IRN and e-way bill flows.',
      caveat: 'Needs an ERPNext/Frappe site to run. GPL-3.0 – anything you distribute built on it must stay open.'
    },
    {
      id: 'file-itr',
      name: 'shivprime94/file-itr',
      url: 'https://github.com/shivprime94/file-itr',
      description: 'Agent skill that walks an individual through preparing and e-filing ITR-1/2/3/4 under either regime.',
      category: 'itr',
      license: 'MIT',
      stars: 544, forks: 82, language: 'Python', lastPush: '2026-10-05',
      homepage: '',
      why: 'Highest-starred open ITR preparation project in this list, with engine tests in CI. Good reference for form-selection logic and regime comparison.',
      caveat: 'It is an agent skill, not a web app – you still file on the portal yourself.'
    },
    {
      id: 'opentax',
      name: 'Nootus/OpenTax',
      url: 'https://github.com/Nootus/OpenTax',
      description: 'Open-source income tax filing for India (TypeScript).',
      category: 'itr',
      license: 'Apache-2.0',
      stars: 18, forks: 5, language: 'TypeScript', lastPush: '2026-04-02',
      homepage: 'https://opentax.indiatax.ai',
      why: 'Permissive licence and a modern stack – the easiest of these to fork for your own filing UI.',
      caveat: 'Last push is months old and the hosted demo was not reachable at the time of the previous review. Treat the demo as unavailable until you check it yourself.',
      status: 'small but active-ish'
    },
    {
      id: 'free-gst-billing',
      name: 'IamRamgarhia/Free-GST-Billing-Software',
      url: 'https://github.com/IamRamgarhia/Free-GST-Billing-Software',
      description: 'Free GST invoice builder for India: tax invoices, quotations, credit notes as PDF plus GSTR-1/3B reports.',
      category: 'gst',
      license: 'MIT',
      stars: 388, forks: 161, language: 'JavaScript', lastPush: '2026-10-31',
      homepage: 'https://dicecodes.com/free-gst-software-documentation/',
      why: 'Closest open-source peer to TaxMitra billing: offline, no signup, GST invoice plus GSTR working papers.',
      caveat: 'Verify the GSTR export format against the current portal schema before relying on it.'
    },
    {
      id: 'khataos',
      name: 'khataos/khataos',
      url: 'https://github.com/khataos/khataos',
      description: 'Offline accounting software with GST/VAT and e-invoicing support for India and several other countries.',
      category: 'accounting',
      license: 'AGPL-3.0',
      stars: 2, forks: 2, language: 'Rust', lastPush: '2026-10-31',
      homepage: 'https://khataos.org',
      why: 'Local-first desktop accounting written in Rust, with TallyPrime import – an unusual and useful combination.',
      caveat: 'Very new and very small (2 stars). AGPL-3.0 is network-copyleft: modifications must be shared.'
    },
    {
      id: 'coffer',
      name: 'abinauv/coffer',
      url: 'https://github.com/abinauv/coffer',
      description: 'Offline, encrypted GST accounting and ERP for Indian small businesses: invoicing, double-entry books, inventory.',
      category: 'accounting',
      license: 'AGPL-3.0',
      stars: 0, forks: 0, language: 'TypeScript', lastPush: '2026-10-30',
      homepage: '',
      why: 'Local-first and encrypted by design – conceptually the same approach TaxMitra billing takes, with real double-entry underneath.',
      caveat: 'Self-declared alpha with no users yet. Do not put real books in it without backups.',
      status: 'alpha'
    },
    {
      id: 'jantahr',
      name: 'devag7/jantahr',
      url: 'https://github.com/devag7/jantahr',
      description: 'Open-source India HR and payroll: PF, ESI, TDS, professional tax and labour-code rules.',
      category: 'payroll',
      license: 'AGPL-3.0',
      stars: 1, forks: 0, language: 'TypeScript', lastPush: '2026-10-26',
      homepage: 'https://jantahr.devshipit.com',
      why: 'One of the few open-source Indian payroll codebases that models PF, ESI and professional tax together.',
      caveat: 'Alone at 1 star – audit the statutory rates yourself before running a real payroll.'
    },
    {
      id: 'gstr-wala',
      name: 'quantavil/gstr-wala',
      url: 'https://github.com/quantavil/gstr-wala',
      description: 'Python engine and agent skill for GSTR-1, GSTR-3B, GSTR-2B reconciliation and Rule 88A ITC optimisation.',
      category: 'gst',
      license: 'GPL-3.0',
      stars: 5, forks: 0, language: 'Python', lastPush: '2026-10-10',
      homepage: '',
      why: 'Rule 88A ITC set-off ordering is exactly the detail most free tools get wrong; this one implements it explicitly.',
      caveat: 'Small project – read the rule implementation before trusting a refund figure.'
    },
    {
      id: 'mcp-einvoicing-in',
      name: 'cmendezs/mcp-einvoicing-in',
      url: 'https://github.com/cmendezs/mcp-einvoicing-in',
      description: 'MCP server that builds and structurally validates GST e-invoice payloads (FORM GST INV-01 v1.1) and renders the QR code.',
      category: 'gst',
      license: 'Apache-2.0',
      stars: 1, forks: 0, language: 'Python', lastPush: '2026-09-12',
      homepage: 'https://cmendezs.github.io/mcp-einvoicing-in/',
      why: 'A clean, permissively licensed reference for the e-invoice JSON schema and IRN payload shape.',
      caveat: 'It validates offline; it cannot register an IRN without a GSP/IRP account.'
    },
    {
      id: 'indian-fincodes-api',
      name: 'kskarthik/indian-fincodes-api',
      url: 'https://github.com/kskarthik/indian-fincodes-api',
      description: 'Dockerised REST API to search Indian banks, pincodes and HSN/SAC codes, backed by Meilisearch.',
      category: 'data',
      license: 'NO LICENSE FILE',
      stars: 12, forks: 1, language: 'Python', lastPush: '2025-03-27',
      homepage: 'https://hub.docker.com/r/kskarthik/indian-fincodes-api',
      why: 'Self-hostable HSN/SAC search with typo tolerance – handy if you want HSN lookup with fuzzy matching.',
      caveat: 'No licence file means default copyright: you may not legally reuse the code. Stale since March 2025.'
    },
    {
      id: 'gst-hsn-fetch',
      name: 'geongeorge/GST-HSN-Codes-Fetch',
      url: 'https://github.com/geongeorge/GST-HSN-Codes-Fetch',
      description: 'Scraper that pulls the latest HSN code list from the official GST website.',
      category: 'data',
      license: 'MIT',
      stars: 6, forks: 5, language: 'JavaScript', lastPush: '2023-01-24',
      homepage: '',
      why: 'Useful only as a starting point for building your own HSN master from the CBIC list.',
      caveat: 'Unmaintained since 2023 and GST 2.0 (September 2025) changed many rates – scrape output must be re-verified.'
    },
    {
      id: 'hsn-code-package',
      name: 'karthi-21/HSN-Code-Package',
      url: 'https://github.com/karthi-21/HSN-Code-Package',
      description: 'Zero-dependency HSN/SAC lookup and GST toolkit: 12,000+ codes, GST rates, GSTIN/PAN validation, CGST/SGST/IGST math.',
      category: 'data',
      license: 'NO LICENSE FILE',
      stars: 3, forks: 2, language: 'JavaScript', lastPush: '2026-08-02',
      homepage: 'https://hsn-gst-demo.karthi-21.com/',
      why: 'A useful independent implementation to cross-check TaxMitra GSTIN validation and split logic.',
      caveat: 'No licence file, so treat it as read-only reference rather than a dependency.'
    },
    {
      id: 'india-ca-due-dates',
      name: 'aiutility1-Gireesh/india-ca-compliance-due-dates',
      url: 'https://github.com/aiutility1-Gireesh/india-ca-compliance-due-dates',
      description: 'Structured compliance calendar for Indian CAs: income tax, TDS, GST, PF/ESI, ROC, professional tax, FSSAI.',
      category: 'data',
      license: 'MIT',
      stars: 0, forks: 0, language: 'Markdown', lastPush: '2026-03-13',
      homepage: '',
      why: 'Plain structured data, easy to fold into a compliance-due-date feature (TaxMitra has a manual calendar today).',
      caveat: 'Community-maintained and unverified by any authority – always confirm dates on the official portal.'
    },
    {
      id: 'prepare-india-tax-return',
      name: 'bagdeabhishek/prepare-india-tax-return',
      url: 'https://github.com/bagdeabhishek/prepare-india-tax-return',
      description: 'Codex skill for screen-by-screen ITR-2 filing with foreign income, Schedule FA, foreign tax credit and Form 67.',
      category: 'itr',
      license: 'MIT',
      stars: 22, forks: 4, language: 'Python', lastPush: '2026-07-28',
      homepage: '',
      why: 'The Schedule FA and Form 67 walkthroughs are the part almost no free tool explains well.',
      caveat: 'Instructional skill, not a calculator. Foreign-tax-credit rules need professional review.'
    },
    {
      id: 'india-itr-skills',
      name: 'ankitkr/india-itr-skills',
      url: 'https://github.com/ankitkr/india-itr-skills',
      description: 'ITR-1/ITR-2 filing skills: AIS/TIS/26AS reconciliation, Schedule AL, Schedule 112A CSV and portal entry schedules.',
      category: 'itr',
      license: 'MIT',
      stars: 2, forks: 0, language: 'Markdown', lastPush: '2026-07-31',
      homepage: '',
      why: 'Documents real filing traps (10-IEA regime lock, Schedule-IT dropping advance-tax challans) that are easy to miss in a calculator.',
      caveat: 'ITR-4 support is self-declared beta. AIS/26AS data must still be reconciled by the taxpayer.'
    },
    {
      id: 'erpnext',
      name: 'frappe/erpnext',
      url: 'https://github.com/frappe/erpnext',
      description: 'Full open-source ERP: ledgers, invoices, receivables/payables, inventory, assets and financial reports.',
      category: 'accounting',
      license: 'GPL-3.0',
      stars: 40801, forks: 13349, language: 'Python', lastPush: '2026-10-31',
      homepage: 'https://frappe.io/erpnext',
      why: 'The default serious answer for open-source double-entry accounting; with india-compliance it becomes GST-aware.',
      caveat: 'Self-hosting a Frappe stack is a real ops task – not a one-afternoon install.'
    },
    {
      id: 'frappe-hrms',
      name: 'frappe/hrms',
      url: 'https://github.com/frappe/hrms',
      description: 'Open-source HR and payroll: employees, attendance, leave, salary structures and payroll runs.',
      category: 'payroll',
      license: 'GPL-3.0',
      stars: 8996, forks: 2856, language: 'Python', lastPush: '2026-10-30',
      homepage: 'https://frappe.io/hr',
      why: 'Same framework as ERPNext, so payroll and books share one employee master.',
      caveat: 'Indian statutory payroll specifics come from india-compliance; verify PF/ESI/PT rates for your state.'
    },
    {
      id: 'firefly-iii',
      name: 'firefly-iii/firefly-iii',
      url: 'https://github.com/firefly-iii/firefly-iii',
      description: 'Self-hosted personal finance manager with budgets, accounts, rules and reporting.',
      category: 'accounting',
      license: 'AGPL-3.0',
      stars: 25045, forks: 2355, language: 'PHP', lastPush: '2026-10-31',
      homepage: 'https://firefly-iii.org/',
      why: 'Best-in-class self-hosted money manager if a client (or you) needs budgeting rather than bookkeeping.',
      caveat: 'Personal finance, not GST invoicing – no tax-invoice or return workflow.'
    },
    {
      id: 'actual',
      name: 'actualbudget/actual',
      url: 'https://github.com/actualbudget/actual',
      description: 'Local-first personal budgeting app with a sync server you can self-host.',
      category: 'accounting',
      license: 'MIT',
      stars: 29884, forks: 3226, language: 'TypeScript', lastPush: '2026-10-31',
      homepage: 'https://actualbudget.org',
      why: 'A polished reference implementation of the local-first architecture TaxMitra billing uses.',
      caveat: 'Zero-based personal budgeting – not a business accounting or GST tool.'
    },
    {
      id: 'beancount',
      name: 'beancount/beancount',
      url: 'https://github.com/beancount/beancount',
      description: 'Double-entry accounting from plain-text files, with a query language and reports.',
      category: 'accounting',
      license: 'GPL-2.0',
      stars: 6138, forks: 486, language: 'Python', lastPush: '2026-08-23',
      homepage: 'http://beancount.github.io/',
      why: 'Plain-text books are diffable, greppable and audit-friendly – ideal for a CA review workflow.',
      caveat: 'Needs discipline and scripting; no GUI invoicing or GST returns.'
    },
    {
      id: 'hledger',
      name: 'hledgerorg/hledger',
      url: 'https://github.com/hledgerorg/hledger',
      description: 'Fast plain-text accounting with CLI, terminal UI and web interfaces.',
      category: 'accounting',
      license: 'GPL-3.0',
      stars: 4801, forks: 425, language: 'Haskell', lastPush: '2026-10-30',
      homepage: 'https://hledger.org',
      why: 'The most approachable plain-text accounting tool, with good reports and a gentle learning curve.',
      caveat: 'No Indian GST/tax-invoice awareness – you model taxes yourself.'
    },
    {
      id: 'paperless-ngx',
      name: 'paperless-ngx/paperless-ngx',
      url: 'https://github.com/paperless-ngx/paperless-ngx',
      description: 'Document management system that scans, OCRs, tags and full-text searches your paper archive.',
      category: 'documents',
      license: 'GPL-3.0',
      stars: 47442, forks: 3316, language: 'Python', lastPush: '2026-10-31',
      homepage: 'http://docs.paperless-ngx.com/',
      why: 'The standard answer for a paperless client-document archive before tax season.',
      caveat: 'Document storage only – it does not extract GST or ITR figures for you.'
    },
    {
      id: 'ocrmypdf',
      name: 'ocrmypdf/OCRmyPDF',
      url: 'https://github.com/ocrmypdf/OCRmyPDF',
      description: 'Adds a searchable OCR text layer to scanned PDFs, with deskew and PDF/A output.',
      category: 'documents',
      license: 'MPL-2.0',
      stars: 35200, forks: 2440, language: 'Python', lastPush: '2026-10-25',
      homepage: 'http://ocrmypdf.readthedocs.io/',
      why: 'Batch-convert scanned bank statements and bills into searchable PDFs that feed an archive.',
      caveat: 'OCR quality on Indian-language or low-DPI scans varies widely – always spot-check.'
    },
    {
      id: 'pdfarranger',
      name: 'pdfarranger/pdfarranger',
      url: 'https://github.com/pdfarranger/pdfarranger',
      description: 'Desktop tool to merge, split, rotate, crop and reorder PDF pages.',
      category: 'documents',
      license: 'GPL-3.0',
      stars: 6010, forks: 325, language: 'Python', lastPush: '2026-10-01',
      homepage: '',
      why: 'Quick way to assemble a Form 16 + bank statement bundle into one client PDF.',
      caveat: 'Desktop GTK app – not scriptable without extra work.'
    },
    {
      id: 'libreoffice',
      name: 'LibreOffice/core',
      url: 'https://github.com/LibreOffice/core',
      description: 'The LibreOffice source: Calc spreadsheets, Writer documents and macros.',
      category: 'documents',
      license: 'GPL-3.0',
      stars: 4584, forks: 996, language: 'C++', lastPush: '2026-10-31',
      homepage: 'https://www.libreoffice.org/',
      why: 'Free workpapers without a Microsoft licence – Calc handles most CA schedules comfortably.',
      caveat: 'This GitHub repo is a read-only mirror. Download installers from libreoffice.org, not from here.'
    }
  ];

  /* ------------------------- querying ------------------------- */
  function normalise(value) {
    return String(value === null || value === undefined ? '' : value).toLowerCase();
  }

  /**
   * Filter + sort the directory.
   * @param {Object} options { query, category, licence, includeUnlicensed, sort }
   */
  function search(options) {
    var opts = options || {};
    var query = normalise(opts.query).trim();
    var category = opts.category || 'all';
    var licence = opts.licence || 'all';
    var sort = opts.sort || 'stars';

    var results = REPOS.filter(function (repo) {
      if (category !== 'all' && repo.category !== category) return false;
      if (licence === 'reusable' && !isReusableLicence(repo.license)) return false;
      if (licence === 'copyleft' && !/GPL|MPL/i.test(repo.license)) return false;
      if (licence === 'unlicensed' && isReusableLicence(repo.license)) return false;
      if (opts.includeUnlicensed === false && !isReusableLicence(repo.license)) return false;
      if (!query) return true;
      var haystack = [repo.name, repo.description, repo.why, repo.caveat, repo.language, repo.license, repo.category, repo.homepage].join(' ');
      return normalise(haystack).indexOf(query) !== -1;
    });

    results.sort(function (a, b) {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'recent') return b.lastPush.localeCompare(a.lastPush);
      if (sort === 'licence') return a.license.localeCompare(b.license);
      return b.stars - a.stars;
    });
    return results;
  }

  function isReusableLicence(license) {
    return !!license && license !== 'NO LICENSE FILE';
  }

  function categoriesWithCounts() {
    var counts = {};
    REPOS.forEach(function (repo) { counts[repo.category] = (counts[repo.category] || 0) + 1; });
    return CATEGORIES.map(function (category) {
      return { id: category.id, label: category.label, count: category.id === 'all' ? REPOS.length : (counts[category.id] || 0) };
    });
  }

  /** Integrities the page (and the test suite) relies on. */
  function summary() {
    var licenses = {};
    var unlicensed = 0;
    REPOS.forEach(function (repo) {
      licenses[repo.license] = (licenses[repo.license] || 0) + 1;
      if (!isReusableLicence(repo.license)) unlicensed += 1;
    });
    return {
      verifiedOn: VERIFIED_ON,
      total: REPOS.length,
      unlicensed: unlicensed,
      licenses: licenses,
      categories: categoriesWithCounts()
    };
  }

  return {
    VERIFIED_ON: VERIFIED_ON,
    CATEGORIES: CATEGORIES,
    REPOS: REPOS,
    search: search,
    summary: summary,
    isReusableLicence: isReusableLicence,
    categoriesWithCounts: categoriesWithCounts
  };
});
