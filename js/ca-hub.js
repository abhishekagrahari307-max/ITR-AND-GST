/* ===================================================
   TaxMitra – CA Practice Hub India · curated catalog
   A discovery + workflow hub for Indian tax/compliance
   software, government APIs, datasets and practice tools.

   Honest labelling rules (see docs/CA-HUB.md):
   * Every entry carries an access_class badge – never a
     generic "free API" claim. Government integrations are
     labelled by their real approval path (ERI / GSP /
     consent), not as public APIs.
   * GitHub star/fork numbers are only copied from the
     GitHub-API-verified directory in js/github-tools.js
     (VERIFIED_ON 2026-10-31). Entries that were not
     re-checked carry verificationStatus "curator-listed"
     and say so in curatorNotes.
   * Nothing here files, submits or fetches from a
     government portal. This is a directory + local
     workspace, not an authorised e-filing intermediary.

   Data model per entry (plan §5):
   id, name, category, subcategory, provider, summary,
   useCases[], kind, accessClass, authMethod,
   approvalRequired, consentRequired, productionStatus,
   sandboxUrl, officialDocsUrl, homepageUrl, githubUrl,
   license, pricingNote, rateLimitNote, dataSensitivity,
   supportedFormsOrWorkflows, limitations, sourceUrls[],
   lastVerifiedAt, verificationStatus, curatorNotes
   =================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TMHub = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERIFIED_ON = '2026-11-21';

  /* -------------------------------------------------
     Access classes (plan §4) – shown as badges on
     every listing. No generic "free API" label.
     ------------------------------------------------- */
  var ACCESS_CLASSES = [
    { id: 'public-open', label: 'Public / open', short: 'Public', description: 'Usable without an account, subject to the provider\'s published terms.' },
    { id: 'key-required', label: 'Key required', short: 'Key', description: 'Registration / API key required. Rate limits may apply.' },
    { id: 'approval-consent', label: 'Approval / consent required', short: 'Approval', description: 'Provider or taxpayer authorisation is required before use.' },
    { id: 'partner-eri', label: 'Partner / GSP / ERI required', short: 'Partner', description: 'Restricted integration pathway (registered ERI, GSP or partner only).' },
    { id: 'self-hosted', label: 'Self-hosted connector', short: 'Self-hosted', description: 'Requires your own software instance and credentials.' },
    { id: 'paid-vendor', label: 'Paid / vendor API', short: 'Vendor', description: 'Commercial terms apply. Listed for reference; no unrestricted API is claimed.' },
    { id: 'sandbox-only', label: 'Sandbox only', short: 'Sandbox', description: 'Test environment only. Not for production filing.' },
    { id: 'no-api', label: 'No API found', short: 'No API', description: 'Listed for reference. No verified API is known – use the manual portal handoff.' }
  ];

  var CATEGORIES = [
    { id: 'all', label: 'All categories' },
    { id: 'itr', label: 'ITR & income tax' },
    { id: 'gst', label: 'GST & e-invoicing' },
    { id: 'tds', label: 'TDS / TCS' },
    { id: 'audit', label: 'Audit & assurance' },
    { id: 'accounting', label: 'Accounting & ERP' },
    { id: 'payroll', label: 'Payroll & HR' },
    { id: 'mca', label: 'MCA / ROC' },
    { id: 'practice', label: 'Practice management & documents' },
    { id: 'datasets', label: 'Public datasets & reference data' }
  ];

  var KINDS = [
    { id: 'all', label: 'All kinds' },
    { id: 'api', label: 'Government / platform API' },
    { id: 'software', label: 'Software / app' },
    { id: 'repository', label: 'Open-source repository' },
    { id: 'dataset', label: 'Dataset / data API' },
    { id: 'vendor', label: 'Commercial vendor (reference)' }
  ];

  var VERIFICATION_STATUSES = [
    { id: 'github-verified', label: 'GitHub API verified' },
    { id: 'official-source-linked', label: 'Official source linked' },
    { id: 'curator-listed', label: 'Curator listed – re-check before use' }
  ];

  /* -------------------------------------------------
     The curated catalog. Order is editorial, not a
     ranking – the directory never claims "best".
     ------------------------------------------------- */
  var TOOLS = [
    {
      id: 'eri-apis',
      name: 'Income Tax e-Filing – ERI APIs',
      category: 'itr',
      subcategory: 'Return filing integration',
      provider: 'Income Tax Department (Govt. of India)',
      summary: 'Official API specifications for Electronic Return Intermediaries (ERIs) to integrate return preparation and filing with the e-Filing portal.',
      useCases: ['Integrate ITR preparation into authorised practice software', 'Pre-validate return JSON before portal upload', 'Track filing status through an approved channel'],
      kind: 'api',
      accessClass: 'partner-eri',
      authMethod: 'ERI registration + taxpayer consent (per ERI API specification)',
      approvalRequired: true,
      consentRequired: true,
      productionStatus: 'Production access only for eligible, registered ERIs. Not a public API.',
      sandboxUrl: '',
      officialDocsUrl: 'https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1',
      homepageUrl: 'https://www.incometax.gov.in/',
      githubUrl: '',
      license: 'Official terms apply',
      pricingNote: 'No public pricing – ERI onboarding terms apply.',
      rateLimitNote: 'As per the ERI API specification and portal terms.',
      dataSensitivity: 'High – taxpayer return data. Never store portal passwords or OTPs.',
      supportedFormsOrWorkflows: 'ITR-1 to ITR-7 return workflows as notified by the Department.',
      limitations: 'Not usable by an unregistered developer or firm. Taxpayer consent is mandatory. TaxMitra does not connect to these APIs.',
      sourceUrls: ['https://www.incometax.gov.in/iec/foportal/sites/default/files/2021-11/ERI%20API%20Specification_v1.1.pdf'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'official-source-linked',
      curatorNotes: 'Specification linked from the plan\'s source list. Re-check the current specification version on the e-Filing portal before any integration work.'
    },
    {
      id: 'opentax',
      name: 'Nootus/OpenTax',
      category: 'itr',
      subcategory: 'Open-source ITR framework',
      provider: 'Nootus (community)',
      summary: 'Open-source income-tax filing framework for India written in TypeScript.',
      useCases: ['Fork as a starting point for a filing UI', 'Study form-selection and computation logic'],
      kind: 'repository',
      accessClass: 'public-open',
      authMethod: 'None (self-hosted code)',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Community project – verify assessment-year coverage and calculations before any live use.',
      sandboxUrl: '',
      officialDocsUrl: '',
      homepageUrl: 'https://opentax.indiatax.ai',
      githubUrl: 'https://github.com/Nootus/OpenTax',
      license: 'Apache-2.0',
      pricingNote: 'Free (open source).',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Depends on your deployment – do not put taxpayer data in a public fork.',
      supportedFormsOrWorkflows: 'Indian ITR workflows (verify current AY coverage in the repo).',
      limitations: 'Small project (18 stars at last GitHub check). The hosted demo was not reachable at the previous review – treat it as unavailable until you check it yourself.',
      sourceUrls: ['https://github.com/Nootus/OpenTax'],
      lastVerifiedAt: '2026-10-31',
      verificationStatus: 'github-verified',
      curatorNotes: 'Stars/forks/licence copied from the GitHub-API-verified directory (js/github-tools.js).',
      stars: 18, forks: 5, language: 'TypeScript', lastPush: '2026-04-02'
    },
    {
      id: 'freefile-itr',
      name: 'rohitthink/freefile',
      category: 'itr',
      subcategory: 'Open-source ITR preparation (freelancers)',
      provider: 'rohitthink (community)',
      summary: 'Open-source ITR preparation project focused on freelancers and presumptive-income cases.',
      useCases: ['Reference for freelancer ITR workflows (44ADA)', 'Study schedule-wise preparation logic'],
      kind: 'repository',
      accessClass: 'public-open',
      authMethod: 'None (self-hosted code)',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Community project – verify forms, scope, security and filing method before use.',
      sandboxUrl: '',
      officialDocsUrl: '',
      homepageUrl: '',
      githubUrl: 'https://github.com/rohitthink/freefile',
      license: 'See repository',
      pricingNote: 'Free (open source).',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Depends on your deployment.',
      supportedFormsOrWorkflows: 'Freelancer / presumptive-income ITR workflows (verify in repo).',
      limitations: 'Curator-listed from the plan – licence, maintenance and AY coverage were not re-verified against the GitHub API for this hub entry. Check the repository before relying on it.',
      sourceUrls: ['https://github.com/rohitthink/freefile'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'curator-listed',
      curatorNotes: 'Listed from the plan\'s catalog table. Re-run the GitHub check (see docs/CA-HUB.md) before promoting this entry.'
    },
    {
      id: 'file-itr',
      name: 'shivprime94/file-itr',
      category: 'itr',
      subcategory: 'Open-source ITR preparation skill',
      provider: 'shivprime94 (community)',
      summary: 'Agent skill that walks an individual through preparing ITR-1/2/3/4 under either tax regime.',
      useCases: ['Reference for form-selection logic', 'Study old-vs-new regime comparison'],
      kind: 'repository',
      accessClass: 'public-open',
      authMethod: 'None (self-hosted code)',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Community project – you still file on the portal yourself.',
      sandboxUrl: '',
      officialDocsUrl: '',
      homepageUrl: '',
      githubUrl: 'https://github.com/shivprime94/file-itr',
      license: 'MIT',
      pricingNote: 'Free (open source).',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Depends on your deployment.',
      supportedFormsOrWorkflows: 'ITR-1 to ITR-4 preparation guidance.',
      limitations: 'It is an agent skill, not a web app or filing service.',
      sourceUrls: ['https://github.com/shivprime94/file-itr'],
      lastVerifiedAt: '2026-10-31',
      verificationStatus: 'github-verified',
      curatorNotes: 'Stars/forks/licence copied from the GitHub-API-verified directory (js/github-tools.js).',
      stars: 544, forks: 82, language: 'Python', lastPush: '2026-10-05'
    },
    {
      id: 'apisetu',
      name: 'API Setu – Government API discovery',
      category: 'gst',
      subcategory: 'API discovery platform',
      provider: 'Government of India (API Setu)',
      summary: 'Official platform to discover government APIs (including GST-related services) and request subscriptions.',
      useCases: ['Discover which government APIs exist for a workflow', 'Request subscription to an API with its own approval flow'],
      kind: 'api',
      accessClass: 'approval-consent',
      authMethod: 'Per-API credentials after subscription approval',
      approvalRequired: true,
      consentRequired: false,
      productionStatus: 'Each listed API has its own approval and credential flow – there is no single API Setu key.',
      sandboxUrl: '',
      officialDocsUrl: 'https://docs.apisetu.gov.in/document-central/explore-apisetu/Overview.html',
      homepageUrl: 'https://apisetu.gov.in/',
      githubUrl: '',
      license: 'Official terms apply',
      pricingNote: 'Per-API terms.',
      rateLimitNote: 'Per-API limits, shown on each API page.',
      dataSensitivity: 'Varies by API – check each API\'s data classification.',
      supportedFormsOrWorkflows: 'Discovery across government APIs (GST, and others).',
      limitations: 'Discovery only – subscribing to an API does not grant production access automatically.',
      sourceUrls: ['https://apisetu.gov.in/', 'https://docs.apisetu.gov.in/document-central/explore-apisetu/Overview.html'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'official-source-linked',
      curatorNotes: 'Official links from the plan\'s source list.'
    },
    {
      id: 'einvoice-sandbox',
      name: 'GST e-Invoice API Sandbox',
      category: 'gst',
      subcategory: 'E-invoicing test environment',
      provider: 'NIC / GSTN (Govt. of India)',
      summary: 'Official sandbox for testing GST e-invoice (IRN/QR) payloads before production integration.',
      useCases: ['Validate INV-01 payload shape', 'Test IRN/QR generation flow in a safe environment'],
      kind: 'api',
      accessClass: 'sandbox-only',
      authMethod: 'Sandbox credentials for testing only',
      approvalRequired: true,
      consentRequired: false,
      productionStatus: 'Sandbox only. Production access needs the relevant taxpayer/GSP setup, credentials and authorisation.',
      sandboxUrl: 'https://einv-apisandbox.nic.in/',
      officialDocsUrl: 'https://einvoice.gst.gov.in/faqs',
      homepageUrl: 'https://einvoice.gst.gov.in/',
      githubUrl: '',
      license: 'Official terms apply',
      pricingNote: 'Sandbox free; production via authorised channels.',
      rateLimitNote: 'As per the e-invoice portal terms.',
      dataSensitivity: 'Use test data only in the sandbox.',
      supportedFormsOrWorkflows: 'E-invoice IRN generation (FORM GST INV-01).',
      limitations: 'Never treat sandbox success as production readiness. TaxMitra does not register IRNs.',
      sourceUrls: ['https://einv-apisandbox.nic.in/', 'https://einvoice.gst.gov.in/faqs'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'official-source-linked',
      curatorNotes: 'Official sandbox + FAQ links from the plan\'s source list.'
    },
    {
      id: 'india-compliance',
      name: 'resilient-tech/india-compliance (ERPNext)',
      category: 'gst',
      subcategory: 'GST + ERP compliance app',
      provider: 'Resilient Tech (open source)',
      summary: 'GST and compliance layer for ERPNext: GSTR-1/3B/9, e-invoicing, e-way bill and India-specific statutory reports.',
      useCases: ['Run GST compliance inside your own ERPNext', 'Generate statutory reports from ERP data'],
      kind: 'repository',
      accessClass: 'self-hosted',
      authMethod: 'Your own ERPNext/Frappe site credentials',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Mature open-source app – verify required ERPNext versions and any paid API services.',
      sandboxUrl: '',
      officialDocsUrl: 'https://indiacompliance.app',
      homepageUrl: 'https://indiacompliance.app',
      githubUrl: 'https://github.com/resilient-tech/india-compliance',
      license: 'GPL-3.0',
      pricingNote: 'Free (open source). Some integrations may need paid services.',
      rateLimitNote: 'Not applicable (self-hosted).',
      dataSensitivity: 'Your ERP data – keep the instance private.',
      supportedFormsOrWorkflows: 'GSTR-1, GSTR-3B, GSTR-9, e-invoice, e-way bill.',
      limitations: 'Needs an ERPNext/Frappe site to run. GPL-3.0 – distributed derivatives must stay open.',
      sourceUrls: ['https://github.com/resilient-tech/india-compliance'],
      lastVerifiedAt: '2026-10-31',
      verificationStatus: 'github-verified',
      curatorNotes: 'Stars/forks/licence copied from the GitHub-API-verified directory (js/github-tools.js).',
      stars: 278, forks: 292, language: 'Python', lastPush: '2026-10-30'
    },
    {
      id: 'gst-accounting-software',
      name: 'usank47/gst-accounting-software',
      category: 'gst',
      subcategory: 'Open-source GST accounting',
      provider: 'usank47 (community)',
      summary: 'Community GST accounting software project for small businesses.',
      useCases: ['Reference for a small GST billing/accounting implementation'],
      kind: 'repository',
      accessClass: 'public-open',
      authMethod: 'None (self-hosted code)',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Community project – review maintenance, export formats and accuracy before live use.',
      sandboxUrl: '',
      officialDocsUrl: '',
      homepageUrl: '',
      githubUrl: 'https://github.com/usank47/gst-accounting-software',
      license: 'See repository',
      pricingNote: 'Free (open source).',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Depends on your deployment.',
      supportedFormsOrWorkflows: 'GST billing/accounting workflows (verify in repo).',
      limitations: 'Curator-listed from the plan – licence and maintenance were not re-verified for this hub entry. Check the repository before relying on it.',
      sourceUrls: ['https://github.com/usank47/gst-accounting-software'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'curator-listed',
      curatorNotes: 'Curator listed from the plan; not re-verified through the GitHub API for this entry. Re-run the check before relying on it.'
    },
    {
      id: 'free-gst-billing',
      name: 'IamRamgarhia/Free-GST-Billing-Software',
      category: 'gst',
      subcategory: 'Open-source GST invoicing',
      provider: 'IamRamgarhia (community)',
      summary: 'Free GST invoice builder for India: tax invoices, quotations and credit notes as PDF, plus GSTR-1/3B reports.',
      useCases: ['Offline GST invoicing for a small business', 'GSTR working-paper reports'],
      kind: 'repository',
      accessClass: 'public-open',
      authMethod: 'None (self-hosted code)',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Community project – verify the GSTR export format against the current portal schema.',
      sandboxUrl: '',
      officialDocsUrl: '',
      homepageUrl: 'https://dicecodes.com/free-gst-software-documentation/',
      githubUrl: 'https://github.com/IamRamgarhia/Free-GST-Billing-Software',
      license: 'MIT',
      pricingNote: 'Free (open source).',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Depends on your deployment.',
      supportedFormsOrWorkflows: 'Tax invoice, quotation, credit note; GSTR-1/3B reports.',
      limitations: 'Verify GSTR export format against the current portal schema before relying on it.',
      sourceUrls: ['https://github.com/IamRamgarhia/Free-GST-Billing-Software'],
      lastVerifiedAt: '2026-10-31',
      verificationStatus: 'github-verified',
      curatorNotes: 'Stars/forks/licence copied from the GitHub-API-verified directory (js/github-tools.js).',
      stars: 388, forks: 161, language: 'JavaScript', lastPush: '2026-10-31'
    },
    {
      id: 'traces-tds',
      name: 'TRACES – TDS/TCS portal (reference)',
      category: 'tds',
      subcategory: 'TDS statement & Form 16',
      provider: 'Income Tax Department (Govt. of India)',
      summary: 'Official TRACES portal for TDS/TCS statements, Form 16/16A and annual information. Listed as a reference – no public API is known.',
      useCases: ['Download Form 16 for employees', 'Reconcile TDS statements before filing 24Q/26Q/27Q'],
      kind: 'api',
      accessClass: 'no-api',
      authMethod: 'Portal login (no public API)',
      approvalRequired: true,
      consentRequired: true,
      productionStatus: 'Portal only. No verified public API – use the manual portal handoff (Guide: manual-portal-handoff).',
      sandboxUrl: '',
      officialDocsUrl: 'https://www.tdscpc.gov.in/',
      homepageUrl: 'https://www.tdscpc.gov.in/',
      githubUrl: '',
      license: 'Official terms apply',
      pricingNote: 'Portal access as per Department terms.',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'High – TDS statements contain PAN-linked data. Never share portal passwords.',
      supportedFormsOrWorkflows: 'Form 16/16A, TDS statements, 24Q/26Q/27Q reconciliation.',
      limitations: 'No verified API. Do not use screen-scraping or store portal credentials.',
      sourceUrls: ['https://www.tdscpc.gov.in/'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'official-source-linked',
      curatorNotes: 'Official portal linked as a reference entry. No API is claimed.'
    },
    {
      id: 'finauditpro',
      name: 'Coderaryanyadav/FinAuditPro',
      category: 'audit',
      subcategory: 'Audit workpaper workflow',
      provider: 'Coderaryanyadav (community)',
      summary: 'Open-source audit workpaper and workflow project.',
      useCases: ['Pilot audit workpaper tracking', 'Study engagement workflow structure'],
      kind: 'repository',
      accessClass: 'public-open',
      authMethod: 'None (self-hosted code)',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Community project – pilot and review controls before relying on it for engagements.',
      sandboxUrl: '',
      officialDocsUrl: '',
      homepageUrl: '',
      githubUrl: 'https://github.com/Coderaryanyadav/FinAuditPro',
      license: 'See repository',
      pricingNote: 'Free (open source).',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Audit workpapers are sensitive – self-host privately.',
      supportedFormsOrWorkflows: 'Audit workpaper workflows (verify in repo).',
      limitations: 'Curator-listed from the plan – licence and controls were not re-verified for this hub entry. Review before any engagement use.',
      sourceUrls: ['https://github.com/Coderaryanyadav/FinAuditPro'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'curator-listed',
      curatorNotes: 'Curator listed from the plan; not re-verified through the GitHub API for this entry. Re-run the check before relying on it.'
    },
    {
      id: 'audit-templates',
      name: 'NAYAN5911/AUDIT-REPO – CA audit templates',
      category: 'audit',
      subcategory: 'Audit templates & checklists',
      provider: 'NAYAN5911 (community)',
      summary: 'Collection of CA audit and finance templates and checklists.',
      useCases: ['Starting point for audit checklists', 'Standardise workpaper formats in a firm'],
      kind: 'repository',
      accessClass: 'public-open',
      authMethod: 'None (files)',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Templates only – not a complete audit automation or statutory filing system.',
      sandboxUrl: '',
      officialDocsUrl: '',
      homepageUrl: '',
      githubUrl: 'https://github.com/NAYAN5911/AUDIT-REPO',
      license: 'See repository',
      pricingNote: 'Free (open source).',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Templates only – add no client data to a public fork.',
      supportedFormsOrWorkflows: 'Audit checklists and finance templates.',
      limitations: 'Templates/checklists, not audit automation. Review every template against current SAs and ICAI guidance.',
      sourceUrls: ['https://github.com/NAYAN5911/AUDIT-REPO'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'curator-listed',
      curatorNotes: 'Curator listed from the plan; not re-verified through the GitHub API for this entry. Re-run the check before relying on it.'
    },
    {
      id: 'erpnext-api',
      name: 'ERPNext / Frappe REST API',
      category: 'accounting',
      subcategory: 'Self-hosted ERP API',
      provider: 'Frappe (open source)',
      summary: 'REST API for a firm\'s own ERPNext instance – read and write accounting, inventory and HR data through Frappe\'s documented endpoints.',
      useCases: ['Sync invoices/customers between your ERPNext and practice tools', 'Build read-only dashboards over your own ERP data'],
      kind: 'api',
      accessClass: 'self-hosted',
      authMethod: 'API key / token for your own Frappe site',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Production use is on your own instance. Keep keys server-side – never in browser code.',
      sandboxUrl: '',
      officialDocsUrl: 'https://docs.frappe.io/framework/user/en/api/rest',
      homepageUrl: 'https://frappe.io/erpnext',
      githubUrl: 'https://github.com/frappe/erpnext',
      license: 'GPL-3.0',
      pricingNote: 'Free (open source). Hosting costs are yours.',
      rateLimitNote: 'Your instance\'s capacity.',
      dataSensitivity: 'Your firm\'s financial data – restrict by role and audit access.',
      supportedFormsOrWorkflows: 'Sales/purchase invoices, ledgers, items, HR – whatever your ERPNext holds.',
      limitations: 'Requires your own ERPNext instance and configuration. Different firms\' APIs do not share one auth model.',
      sourceUrls: ['https://github.com/frappe/erpnext', 'https://docs.frappe.io/framework/user/en/api/rest'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'official-source-linked',
      curatorNotes: 'Official Frappe REST docs linked from the plan\'s source list.'
    },
    {
      id: 'khataos',
      name: 'khataos/khataos',
      category: 'accounting',
      subcategory: 'Offline accounting (Rust)',
      provider: 'khataos (community)',
      summary: 'Offline accounting software with GST/VAT and e-invoicing support, written in Rust, with TallyPrime import.',
      useCases: ['Local-first desktop accounting', 'TallyPrime data migration pilot'],
      kind: 'repository',
      accessClass: 'public-open',
      authMethod: 'None (desktop app)',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Very new and very small – pilot with backups before live books.',
      sandboxUrl: '',
      officialDocsUrl: '',
      homepageUrl: 'https://khataos.org',
      githubUrl: 'https://github.com/khataos/khataos',
      license: 'AGPL-3.0',
      pricingNote: 'Free (open source).',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Local data – back up regularly.',
      supportedFormsOrWorkflows: 'GST/VAT invoicing, e-invoicing support, TallyPrime import.',
      limitations: 'Very new and very small (2 stars at last GitHub check). AGPL-3.0 is network-copyleft.',
      sourceUrls: ['https://github.com/khataos/khataos'],
      lastVerifiedAt: '2026-10-31',
      verificationStatus: 'github-verified',
      curatorNotes: 'Stars/forks/licence copied from the GitHub-API-verified directory (js/github-tools.js).',
      stars: 2, forks: 2, language: 'Rust', lastPush: '2026-10-31'
    },
    {
      id: 'jantahr',
      name: 'devag7/jantahr',
      category: 'payroll',
      subcategory: 'Indian HR & payroll',
      provider: 'devag7 (community)',
      summary: 'Open-source India HR and payroll: PF, ESI, TDS, professional tax and labour-code rules.',
      useCases: ['Reference for PF/ESI/PT computation structure', 'Pilot a payroll calculation engine'],
      kind: 'repository',
      accessClass: 'public-open',
      authMethod: 'None (self-hosted code)',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Community project – audit the statutory rates yourself before running a real payroll.',
      sandboxUrl: '',
      officialDocsUrl: '',
      homepageUrl: 'https://jantahr.devshipit.com',
      githubUrl: 'https://github.com/devag7/jantahr',
      license: 'AGPL-3.0',
      pricingNote: 'Free (open source).',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Payroll data is sensitive – self-host privately.',
      supportedFormsOrWorkflows: 'PF, ESI, TDS on salary, professional tax, labour-code rules.',
      limitations: 'Alone at 1 star at last GitHub check. AGPL-3.0. Verify every statutory rate.',
      sourceUrls: ['https://github.com/devag7/jantahr'],
      lastVerifiedAt: '2026-10-31',
      verificationStatus: 'github-verified',
      curatorNotes: 'Stars/forks/licence copied from the GitHub-API-verified directory (js/github-tools.js).',
      stars: 1, forks: 0, language: 'TypeScript', lastPush: '2026-10-26'
    },
    {
      id: 'mca21',
      name: 'MCA21 portal (reference)',
      category: 'mca',
      subcategory: 'Company filings reference',
      provider: 'Ministry of Corporate Affairs (Govt. of India)',
      summary: 'Official MCA21 portal for company/LLP filings (AOC-4, MGT-7, DIR-3 KYC, etc.). Listed as a reference – no public API is known.',
      useCases: ['File annual ROC forms on the portal', 'Track filing acknowledgements'],
      kind: 'api',
      accessClass: 'no-api',
      authMethod: 'Portal login with DSC (no public API)',
      approvalRequired: true,
      consentRequired: false,
      productionStatus: 'Portal only. No verified public API – use the manual portal handoff.',
      sandboxUrl: '',
      officialDocsUrl: 'https://www.mca.gov.in/',
      homepageUrl: 'https://www.mca.gov.in/',
      githubUrl: '',
      license: 'Official terms apply',
      pricingNote: 'Government filing fees apply per form.',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Company records – never share DSC credentials.',
      supportedFormsOrWorkflows: 'AOC-4, MGT-7, DIR-3 KYC, ADT-1 and other ROC forms.',
      limitations: 'No verified API. DSC private keys must never be stored in any tool.',
      sourceUrls: ['https://www.mca.gov.in/'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'official-source-linked',
      curatorNotes: 'Official portal linked as a reference entry. No API is claimed.'
    },
    {
      id: 'paperless-ngx',
      name: 'paperless-ngx/paperless-ngx',
      category: 'practice',
      subcategory: 'Client document archive',
      provider: 'paperless-ngx (open source)',
      summary: 'Self-hosted document archive that OCRs and indexes scanned client documents for tax season.',
      useCases: ['Paperless client-document archive', 'Searchable Form 16 / bank-statement bundles'],
      kind: 'repository',
      accessClass: 'self-hosted',
      authMethod: 'Your own instance login',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Mature open-source project – self-host privately.',
      sandboxUrl: '',
      officialDocsUrl: 'https://docs.paperless-ngx.com/',
      homepageUrl: 'https://docs.paperless-ngx.com/',
      githubUrl: 'https://github.com/paperless-ngx/paperless-ngx',
      license: 'GPL-3.0',
      pricingNote: 'Free (open source).',
      rateLimitNote: 'Not applicable (self-hosted).',
      dataSensitivity: 'Client documents – encrypt backups, restrict access.',
      supportedFormsOrWorkflows: 'Document storage, OCR indexing, search.',
      limitations: 'Document storage only – it does not extract GST or ITR figures for you.',
      sourceUrls: ['https://github.com/paperless-ngx/paperless-ngx'],
      lastVerifiedAt: '2026-10-31',
      verificationStatus: 'github-verified',
      curatorNotes: 'Stars/forks/licence copied from the GitHub-API-verified directory (js/github-tools.js).',
      stars: 47442, forks: 3316, language: 'Python', lastPush: '2026-10-31'
    },
    {
      id: 'ocrmypdf',
      name: 'ocrmypdf/OCRmyPDF',
      category: 'practice',
      subcategory: 'PDF OCR batch processing',
      provider: 'ocrmypdf (open source)',
      summary: 'Adds a searchable OCR text layer to scanned PDFs, with deskew and PDF/A output.',
      useCases: ['Batch-convert scanned bank statements into searchable PDFs', 'Prepare client bundles for archiving'],
      kind: 'repository',
      accessClass: 'public-open',
      authMethod: 'None (command-line tool)',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Mature open-source tool – spot-check OCR quality on your scans.',
      sandboxUrl: '',
      officialDocsUrl: 'https://ocrmypdf.readthedocs.io/',
      homepageUrl: 'http://ocrmypdf.readthedocs.io/',
      githubUrl: 'https://github.com/ocrmypdf/OCRmyPDF',
      license: 'MPL-2.0',
      pricingNote: 'Free (open source).',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Runs locally – keep client PDFs on your own machine.',
      supportedFormsOrWorkflows: 'PDF OCR, deskew, PDF/A output.',
      limitations: 'OCR quality on Indian-language or low-DPI scans varies widely – always spot-check.',
      sourceUrls: ['https://github.com/ocrmypdf/OCRmyPDF'],
      lastVerifiedAt: '2026-10-31',
      verificationStatus: 'github-verified',
      curatorNotes: 'Stars/forks/licence copied from the GitHub-API-verified directory (js/github-tools.js).',
      stars: 35200, forks: 2440, language: 'Python', lastPush: '2026-10-25'
    },
    {
      id: 'ogd-india',
      name: 'Open Government Data (OGD) India',
      category: 'datasets',
      subcategory: 'Public data API',
      provider: 'Government of India (data.gov.in)',
      summary: 'Official catalogue of public datasets with a data API for reference data (not taxpayer records).',
      useCases: ['Reference datasets for research and dashboards', 'HSN/state/master-data lookups where published'],
      kind: 'dataset',
      accessClass: 'key-required',
      authMethod: 'API key (free registration)',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Public reference data. Dataset API access can require an API key.',
      sandboxUrl: '',
      officialDocsUrl: 'https://www.data.gov.in/help',
      homepageUrl: 'https://www.data.gov.in/apis',
      githubUrl: '',
      license: 'Per-dataset terms (check each dataset)',
      pricingNote: 'Free with registration.',
      rateLimitNote: 'As per data.gov.in API terms – check the dataset page.',
      dataSensitivity: 'Public data only – never upload taxpayer records.',
      supportedFormsOrWorkflows: 'Dataset search and API access to published datasets.',
      limitations: 'Not real-time unless the publisher confirms it. Always check the dataset\'s update frequency and licence.',
      sourceUrls: ['https://www.data.gov.in/apis', 'https://www.data.gov.in/help'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'official-source-linked',
      curatorNotes: 'Official links from the plan\'s source list.'
    },
    {
      id: 'indian-fincodes-api',
      name: 'kskarthik/indian-fincodes-api',
      category: 'datasets',
      subcategory: 'HSN/SAC & pincode search API',
      provider: 'kskarthik (community)',
      summary: 'Dockerised REST API to search Indian banks, pincodes and HSN/SAC codes, backed by Meilisearch.',
      useCases: ['Self-hostable HSN/SAC search with typo tolerance', 'Pincode/bank master lookups'],
      kind: 'repository',
      accessClass: 'self-hosted',
      authMethod: 'Your own Docker instance',
      approvalRequired: false,
      consentRequired: false,
      productionStatus: 'Stale since March 2025 – verify HSN data against the current CBIC list.',
      sandboxUrl: '',
      officialDocsUrl: '',
      homepageUrl: 'https://hub.docker.com/r/kskarthik/indian-fincodes-api',
      githubUrl: 'https://github.com/kskarthik/indian-fincodes-api',
      license: 'NO LICENSE FILE',
      pricingNote: 'Free (open source, but unlicensed – see limitations).',
      rateLimitNote: 'Your instance\'s capacity.',
      dataSensitivity: 'Reference data only.',
      supportedFormsOrWorkflows: 'HSN/SAC, bank, pincode search.',
      limitations: 'No licence file means default copyright: you may not legally reuse the code. Stale since March 2025.',
      sourceUrls: ['https://github.com/kskarthik/indian-fincodes-api'],
      lastVerifiedAt: '2026-10-31',
      verificationStatus: 'github-verified',
      curatorNotes: 'Stars/forks/licence copied from the GitHub-API-verified directory (js/github-tools.js).',
      stars: 12, forks: 1, language: 'Python', lastPush: '2025-03-27'
    },
    {
      id: 'computax',
      name: 'CompuTax (vendor reference)',
      category: 'itr',
      subcategory: 'Commercial tax software',
      provider: 'CompuTax',
      summary: 'Established commercial tax computation and return-preparation software used by CA firms. Listed for reference – no public GitHub repository or unrestricted API is claimed.',
      useCases: ['Firm-wide tax computation and ITR preparation'],
      kind: 'vendor',
      accessClass: 'paid-vendor',
      authMethod: 'Vendor licence (no public API)',
      approvalRequired: true,
      consentRequired: false,
      productionStatus: 'Commercial product – contact the vendor for current features, forms and pricing.',
      sandboxUrl: '',
      officialDocsUrl: 'https://www.computax.in/',
      homepageUrl: 'https://www.computax.in/',
      githubUrl: '',
      license: 'Commercial',
      pricingNote: 'Commercial – vendor pricing.',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Client return data – follow the vendor\'s security terms.',
      supportedFormsOrWorkflows: 'ITR computation and return preparation (verify current AY support with vendor).',
      limitations: 'A commercial product does not imply a public API. Add official product/docs links only after review.',
      sourceUrls: ['https://www.computax.in/'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'curator-listed',
      curatorNotes: 'Vendor reference from the plan\'s catalog table. Verify product details with the vendor before recommending.'
    },
    {
      id: 'tax2win',
      name: 'Tax2win (vendor reference)',
      category: 'itr',
      subcategory: 'Commercial ITR filing platform',
      provider: 'Tax2win',
      summary: 'Commercial ITR filing and tax-planning platform for individuals. Listed for reference – no public API is claimed.',
      useCases: ['Individual ITR filing and tax planning'],
      kind: 'vendor',
      accessClass: 'paid-vendor',
      authMethod: 'Vendor account (no public API)',
      approvalRequired: true,
      consentRequired: true,
      productionStatus: 'Commercial product – contact the vendor for current features and pricing.',
      sandboxUrl: '',
      officialDocsUrl: 'https://www.tax2win.in/',
      homepageUrl: 'https://www.tax2win.in/',
      githubUrl: '',
      license: 'Commercial',
      pricingNote: 'Commercial – vendor pricing.',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Taxpayer data – follow the vendor\'s privacy terms.',
      supportedFormsOrWorkflows: 'Individual ITR filing (verify current AY support with vendor).',
      limitations: 'No public GitHub repository or unrestricted API is claimed for this vendor.',
      sourceUrls: ['https://www.tax2win.in/'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'curator-listed',
      curatorNotes: 'Vendor reference from the plan\'s catalog table. Verify product details with the vendor before recommending.'
    },
    {
      id: 'winman',
      name: 'Winman (vendor reference)',
      category: 'accounting',
      subcategory: 'Commercial accounting software',
      provider: 'Winman Software',
      summary: 'Commercial accounting and ERP software for Indian businesses. Listed for reference – no public API is claimed.',
      useCases: ['Business accounting and ERP'],
      kind: 'vendor',
      accessClass: 'paid-vendor',
      authMethod: 'Vendor licence (no public API)',
      approvalRequired: true,
      consentRequired: false,
      productionStatus: 'Commercial product – contact the vendor for current features and pricing.',
      sandboxUrl: '',
      officialDocsUrl: 'https://www.winman.in/',
      homepageUrl: 'https://www.winman.in/',
      githubUrl: '',
      license: 'Commercial',
      pricingNote: 'Commercial – vendor pricing.',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Business financial data – follow the vendor\'s security terms.',
      supportedFormsOrWorkflows: 'Accounting, inventory, GST workflows (verify with vendor).',
      limitations: 'No public GitHub repository or unrestricted API is claimed for this vendor.',
      sourceUrls: ['https://www.winman.in/'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'curator-listed',
      curatorNotes: 'Vendor reference from the plan\'s catalog table. Verify product details with the vendor before recommending.'
    },
    {
      id: 'cleartax',
      name: 'ClearTax (vendor reference)',
      category: 'gst',
      subcategory: 'Commercial GST & ITR platform',
      provider: 'ClearTax',
      summary: 'Commercial GST, ITR and compliance platform for businesses and CAs. Listed for reference – no unrestricted public API is claimed.',
      useCases: ['GST filing, ITR filing and compliance workflows'],
      kind: 'vendor',
      accessClass: 'paid-vendor',
      authMethod: 'Vendor account / partner onboarding (no public API)',
      approvalRequired: true,
      consentRequired: true,
      productionStatus: 'Commercial product – contact the vendor for current features, partner terms and pricing.',
      sandboxUrl: '',
      officialDocsUrl: 'https://cleartax.in/',
      homepageUrl: 'https://cleartax.in/',
      githubUrl: '',
      license: 'Commercial',
      pricingNote: 'Commercial – vendor pricing.',
      rateLimitNote: 'Not applicable.',
      dataSensitivity: 'Client tax data – follow the vendor\'s privacy and consent terms.',
      supportedFormsOrWorkflows: 'GST returns, ITR filing, TDS workflows (verify with vendor).',
      limitations: 'A commercial product does not imply a public API. Partner/GSP pathways are vendor-specific.',
      sourceUrls: ['https://cleartax.in/'],
      lastVerifiedAt: '2026-11-21',
      verificationStatus: 'curator-listed',
      curatorNotes: 'Vendor reference from the plan\'s catalog table. Verify product details with the vendor before recommending.'
    }
  ];

  /* -------------------------------------------------
     Guides (plan §2) – workflow explanations. Each
     guide ends with what must still be done on the
     official portal.
     ------------------------------------------------- */
  var GUIDES = [
    {
      id: 'eri-onboarding',
      title: 'ERI API access: eligibility, consent and the human confirmation step',
      category: 'itr',
      minutes: 6,
      intro: 'The Income Tax e-Filing ERI APIs are not a public API. This guide explains who can use them, what consent means, and why a human must confirm before any submission.',
      steps: [
        'Confirm eligibility: only registered Electronic Return Intermediaries (ERIs) can integrate with the e-Filing APIs. An unregistered firm or developer cannot.',
        'Read the current ERI API specification on the e-Filing portal and note the exact endpoints, auth method and taxpayer-consent flow for your use case.',
        'Design consent first: capture and record the taxpayer\'s explicit consent for the specific purpose (preparation, validation, or filing) before any data moves.',
        'Keep secrets server-side: ERI credentials belong in a secrets manager, never in browser code, logs or a public repository.',
        'Add a human confirmation step: show the computed return to the taxpayer/reviewer and require explicit approval before any submission action.',
        'Log everything: consent records, reads, exports and filing-related actions in an audit trail.',
        'Still to do on the official portal: registration, consent capture, e-verification and any submission the API does not cover.'
      ],
      relatedToolIds: ['eri-apis']
    },
    {
      id: 'einvoice-sandbox-to-production',
      title: 'E-invoice sandbox → production checklist',
      category: 'gst',
      minutes: 5,
      intro: 'Sandbox success is not production readiness. Use this checklist to move from the NIC sandbox to a real IRN flow without confusing the two environments.',
      steps: [
        'Build INV-01 payloads against the sandbox (einv-apisandbox.nic.in) with test data only.',
        'Validate structure offline first (schema, HSN/SAC, tax split, QR payload shape) before calling any endpoint.',
        'Confirm your production pathway: taxpayer/GSP setup, credentials and authorisation. The sandbox cannot register a real IRN.',
        'Separate sandbox and production configuration (URLs, credentials, data) so they cannot be confused.',
        'Test round-off, CGST/SGST vs IGST split and amount-in-words against your own billing engine.',
        'Still to do on the official portal: IRN registration, e-way bill linkage and portal-side verification.'
      ],
      relatedToolIds: ['einvoice-sandbox', 'india-compliance']
    },
    {
      id: 'erpnext-connector',
      title: 'Connecting your own ERPNext safely (read-only first)',
      category: 'accounting',
      minutes: 6,
      intro: 'The Frappe REST API connects to your own ERPNext instance. Start read-only, keep keys server-side, and expand permissions deliberately.',
      steps: [
        'Create a dedicated API user in your ERPNext with the minimum role needed (start with read-only).',
        'Store the API key/token in a secrets manager or server environment – never in browser code or a public repo.',
        'Use HTTPS and restrict the instance to your firm\'s network or VPN where possible.',
        'Start with read-only sync (customers, items, invoices) and reconcile totals before enabling any write.',
        'Add timeouts, retries with backoff, and per-connector audit logging.',
        'Still to do on the official portal: GST filing itself – the connector only moves your own ERP data.'
      ],
      relatedToolIds: ['erpnext-api', 'india-compliance']
    },
    {
      id: 'ogd-api-key',
      title: 'Getting an OGD India API key and staying within limits',
      category: 'datasets',
      minutes: 4,
      intro: 'Open Government Data India publishes public datasets behind a free API key. Here is the safe way to use it.',
      steps: [
        'Register on data.gov.in and generate an API key for your project.',
        'Check each dataset\'s licence/terms and update frequency before building on it – do not assume real-time data.',
        'Cache responses locally and respect the published rate limits; never upload taxpayer or client records to a public dataset API.',
        'Record the dataset publisher, "data as of" date and licence in your own documentation.',
        'Still to do on the official portal: nothing – OGD is reference data, not a filing channel.'
      ],
      relatedToolIds: ['ogd-india']
    },
    {
      id: 'choosing-tool',
      title: 'How to evaluate a CA tool before you trust it',
      category: 'practice',
      minutes: 5,
      intro: 'A GitHub README is not proof of correctness. Use this evaluation checklist for any tool in this directory.',
      steps: [
        'Check the licence: "NO LICENSE FILE" means default copyright – you may read the code but may not reuse it.',
        'Check maintenance: last push, releases and issue activity. Stars are a signal, not proof of correctness.',
        'Verify forms and AY coverage against official notifications – not the tool\'s homepage claims.',
        'Test in a sandbox or with sample data first; never start with a live client file.',
        'Review security: where does data go? Are secrets server-side? Is there an audit log?',
        'Confirm the access class: public, key, approval, partner, self-hosted, vendor, sandbox or no-API – and plan the manual handoff if there is no API.',
        'Still to do on the official portal: filing, verification and payment – no directory listing replaces them.'
      ],
      relatedToolIds: ['apisetu', 'ogd-india']
    },
    {
      id: 'manual-portal-handoff',
      title: 'Safe fallback when no API exists: export, checklist, portal',
      category: 'practice',
      minutes: 4,
      intro: 'For TRACES, MCA21 and other portal-only workflows, the safe pattern is a working-paper export plus a checklist – never screen-scraping or stored passwords.',
      steps: [
        'Prepare the working paper in your own tool (computation, reconciliation, checklist).',
        'Export a human-readable summary (PDF/CSV/JSON) the client or reviewer can check.',
        'Walk the official portal step-by-step with the checklist; the human enters credentials and OTPs themselves.',
        'Never store portal passwords, OTPs, DSC private keys or API secrets in any tool, log or spreadsheet.',
        'Record what was filed, when, and the acknowledgement number in your engagement notes.',
        'Still to do on the official portal: everything that requires login, DSC or OTP.'
      ],
      relatedToolIds: ['traces-tds', 'mca21']
    }
  ];

  /* -------------------------------------------------
     Updates / changelog (plan §2). Dated entries only –
     no invented activity. Repository activity signals
     are refreshed from GitHub metadata, not claimed
     here as live data.
     ------------------------------------------------- */
  var UPDATES = [
    {
      date: '2026-11-21',
      title: 'CA Practice Hub launched (Phase 1)',
      body: 'Curated directory of 24 entries across ITR, GST, TDS, audit, accounting, payroll, MCA/ROC, practice management and datasets. Every entry carries an access-class badge, source links, limitations and a last-checked date. Comparison (up to 3 tools), guides and a dated updates log are included. The private firm workspace (Phase 2 lite) runs entirely in the browser – no client data leaves the device.'
    },
    {
      date: '2026-10-31',
      title: 'GitHub metadata verified for open-source entries',
      body: 'Stars, forks, licences and last-push dates for repository entries were checked through the GitHub REST API and are shared with the verified open-source directory (js/github-tools.js). Entries not re-checked are marked "Curator listed – re-check before use".'
    },
    {
      date: '2026-11-21',
      title: 'Government and vendor entries linked to official sources',
      body: 'ERI APIs, API Setu, e-Invoice sandbox, OGD India, TRACES and MCA21 entries link to official documentation. Commercial vendors (CompuTax, Tax2win, Winman, ClearTax) are listed as references only – no public API is claimed for any of them.'
    }
  ];

  /* -------------------------------------------------
     Recurring statutory due dates (standard calendar).
     These are the usual statutory dates – extensions
     are notified by CBIC/CBDT and must be checked
     before acting. Event-based dates (AGM-linked ROC
     forms, state professional tax) are intentionally
     excluded because they vary.
     ------------------------------------------------- */
  var RECURRING_DUE_DATES = [
    { id: 'gstr1', label: 'GSTR-1 (monthly)', month: null, day: 11, note: 'Outward supplies return.' },
    { id: 'gstr3b', label: 'GSTR-3B (monthly)', month: null, day: 20, note: 'Summary return with tax payment.' },
    { id: 'tds-deposit', label: 'TDS/TCS deposit', month: null, day: 7, note: '7th of next month (15th for government deductors).' },
    { id: 'pf-esi', label: 'PF / ESI contribution', month: null, day: 15, note: 'Monthly contribution due date.' },
    { id: 'tds-return-q1', label: 'TDS return 24Q/26Q/27Q (Q1)', month: 7, day: 31, note: 'Quarter ending June.' },
    { id: 'tds-return-q2', label: 'TDS return 24Q/26Q/27Q (Q2)', month: 10, day: 31, note: 'Quarter ending September.' },
    { id: 'tds-return-q3', label: 'TDS return 24Q/26Q/27Q (Q3)', month: 1, day: 31, note: 'Quarter ending December.' },
    { id: 'tds-return-q4', label: 'TDS return 24Q/26Q/27Q (Q4)', month: 5, day: 31, note: 'Quarter ending March.' },
    { id: 'advance-tax-1', label: 'Advance tax instalment 1', month: 6, day: 15, note: '15% of advance tax.' },
    { id: 'advance-tax-2', label: 'Advance tax instalment 2', month: 9, day: 15, note: '45% of advance tax.' },
    { id: 'advance-tax-3', label: 'Advance tax instalment 3', month: 12, day: 15, note: '75% of advance tax.' },
    { id: 'advance-tax-4', label: 'Advance tax instalment 4', month: 3, day: 15, note: '100% of advance tax.' },
    { id: 'itr-individual', label: 'ITR due date (non-audit)', month: 7, day: 31, note: 'Individuals/HUF without audit requirement (as notified).' },
    { id: 'itr-audit', label: 'ITR due date (audit cases)', month: 10, day: 31, note: 'Cases requiring audit (as notified).' },
    { id: 'gstr9', label: 'GSTR-9 annual return', month: 12, day: 31, note: 'Annual return (as notified).' }
  ];

  /* ------------------------- querying ------------------------- */
  function normalise(value) {
    return String(value === null || value === undefined ? '' : value).toLowerCase();
  }

  function accessLabel(id) {
    for (var i = 0; i < ACCESS_CLASSES.length; i++) {
      if (ACCESS_CLASSES[i].id === id) return ACCESS_CLASSES[i];
    }
    return { id: id, label: id, short: id, description: '' };
  }

  function categoryLabel(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i].label;
    }
    return id;
  }

  function kindLabel(id) {
    for (var i = 0; i < KINDS.length; i++) {
      if (KINDS[i].id === id) return KINDS[i].label;
    }
    return id;
  }

  function verificationLabel(id) {
    for (var i = 0; i < VERIFICATION_STATUSES.length; i++) {
      if (VERIFICATION_STATUSES[i].id === id) return VERIFICATION_STATUSES[i].label;
    }
    return id;
  }

  function getById(id) {
    for (var i = 0; i < TOOLS.length; i++) {
      if (TOOLS[i].id === id) return TOOLS[i];
    }
    return null;
  }

  function getGuideById(id) {
    for (var i = 0; i < GUIDES.length; i++) {
      if (GUIDES[i].id === id) return GUIDES[i];
    }
    return null;
  }

  /**
   * Filter + sort the catalog.
   * @param {Object} options { query, category, accessClass, kind, sort, favouritesOnly, favouriteIds }
   */
  function search(options) {
    var opts = options || {};
    var query = normalise(opts.query).trim();
    var category = opts.category || 'all';
    var accessClass = opts.accessClass || 'all';
    var kind = opts.kind || 'all';
    var sort = opts.sort || 'name';

    var results = TOOLS.filter(function (tool) {
      if (category !== 'all' && tool.category !== category) return false;
      if (accessClass !== 'all' && tool.accessClass !== accessClass) return false;
      if (kind !== 'all' && tool.kind !== kind) return false;
      if (opts.favouritesOnly) {
        var favs = opts.favouriteIds || [];
        if (favs.indexOf(tool.id) === -1) return false;
      }
      if (!query) return true;
      var haystack = [tool.name, tool.summary, tool.provider, tool.subcategory,
        tool.categoryLabel || categoryLabel(tool.category),
        accessLabel(tool.accessClass).label, tool.license,
        (tool.useCases || []).join(' '), (tool.supportedFormsOrWorkflows || '')].join(' ');
      return normalise(haystack).indexOf(query) !== -1;
    });

    results.sort(function (a, b) {
      if (sort === 'recent') return b.lastVerifiedAt.localeCompare(a.lastVerifiedAt);
      if (sort === 'access') return accessLabel(a.accessClass).label.localeCompare(accessLabel(b.accessClass).label);
      if (sort === 'category') {
        var c = categoryLabel(a.category).localeCompare(categoryLabel(b.category));
        return c !== 0 ? c : a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
    return results;
  }

  function categoriesWithCounts() {
    var counts = {};
    TOOLS.forEach(function (tool) { counts[tool.category] = (counts[tool.category] || 0) + 1; });
    return CATEGORIES.map(function (category) {
      return { id: category.id, label: category.label, count: category.id === 'all' ? TOOLS.length : (counts[category.id] || 0) };
    });
  }

  function accessCounts() {
    var counts = {};
    TOOLS.forEach(function (tool) { counts[tool.accessClass] = (counts[tool.accessClass] || 0) + 1; });
    return ACCESS_CLASSES.map(function (ac) {
      return { id: ac.id, label: ac.label, short: ac.short, description: ac.description, count: counts[ac.id] || 0 };
    });
  }

  function kindCounts() {
    var counts = {};
    TOOLS.forEach(function (tool) { counts[tool.kind] = (counts[tool.kind] || 0) + 1; });
    return KINDS.map(function (kind) {
      return { id: kind.id, label: kind.label, count: kind.id === 'all' ? TOOLS.length : (counts[kind.id] || 0) };
    });
  }

  /** Other tools in the same category (for detail-page "related" lists). */
  function related(tool, limit) {
    if (!tool) return [];
    var max = limit || 3;
    return TOOLS.filter(function (other) {
      return other.id !== tool.id && other.category === tool.category;
    }).slice(0, max);
  }

  /** Fields compared side-by-side (plan §2: workflow/feature, not "best"). */
  var COMPARE_FIELDS = [
    { id: 'category', label: 'Category', get: function (t) { return categoryLabel(t.category) + ' · ' + t.subcategory; } },
    { id: 'provider', label: 'Provider', get: function (t) { return t.provider; } },
    { id: 'kind', label: 'Kind', get: function (t) { return kindLabel(t.kind); } },
    { id: 'access', label: 'Access class', get: function (t) { return accessLabel(t.accessClass).label; } },
    { id: 'auth', label: 'Auth method', get: function (t) { return t.authMethod; } },
    { id: 'approval', label: 'Approval required', get: function (t) { return t.approvalRequired ? 'Yes' : 'No'; } },
    { id: 'consent', label: 'Taxpayer consent required', get: function (t) { return t.consentRequired ? 'Yes' : 'No'; } },
    { id: 'production', label: 'Production status', get: function (t) { return t.productionStatus; } },
    { id: 'license', label: 'Licence / terms', get: function (t) { return t.license; } },
    { id: 'pricing', label: 'Pricing', get: function (t) { return t.pricingNote; } },
    { id: 'workflows', label: 'Supported workflows', get: function (t) { return t.supportedFormsOrWorkflows; } },
    { id: 'sensitivity', label: 'Data sensitivity', get: function (t) { return t.dataSensitivity; } },
    { id: 'limitations', label: 'Limitations', get: function (t) { return t.limitations; } },
    { id: 'verified', label: 'Last checked', get: function (t) { return t.lastVerifiedAt + ' · ' + verificationLabel(t.verificationStatus); } }
  ];

  function compare(ids) {
    var tools = (ids || []).map(getById).filter(Boolean).slice(0, 3);
    return { tools: tools, fields: COMPARE_FIELDS };
  }

  /**
   * Upcoming statutory due dates from `from` (Date or ISO string),
   * within `daysAhead` days. Returns [{ id, label, date: 'YYYY-MM-DD', note }].
   */
  function nextDueDates(from, daysAhead) {
    var start = from instanceof Date ? new Date(from.getTime()) : new Date(from);
    if (isNaN(start.getTime())) start = new Date();
    start.setHours(0, 0, 0, 0);
    var window = typeof daysAhead === 'number' ? daysAhead : 45;
    var out = [];
    RECURRING_DUE_DATES.forEach(function (rule) {
      // Check this year and next year so January rules work from December.
      [start.getFullYear(), start.getFullYear() + 1].forEach(function (year) {
        var month = rule.month === null ? null : rule.month - 1;
        if (month === null) {
          // Monthly rule: next occurrence on/after start.
          var candidate = new Date(year, start.getMonth(), rule.day);
          if (candidate < start) candidate = new Date(year, start.getMonth() + 1, rule.day);
          // Also consider the following month if still within window.
          [candidate, new Date(year, start.getMonth() + 2, rule.day)].forEach(function (d) {
            var diff = Math.round((d - start) / 86400000);
            if (diff >= 0 && diff <= window) {
              out.push({ id: rule.id, label: rule.label, date: toISODate(d), note: rule.note, daysFromNow: diff });
            }
          });
        } else {
          var d = new Date(year, month, rule.day);
          var diff = Math.round((d - start) / 86400000);
          if (diff >= 0 && diff <= window) {
            out.push({ id: rule.id, label: rule.label, date: toISODate(d), note: rule.note, daysFromNow: diff });
          }
        }
      });
    });
    out.sort(function (a, b) { return a.date.localeCompare(b.date); });
    // De-duplicate identical id+date (monthly rules can double-count).
    var seen = {};
    return out.filter(function (item) {
      var key = item.id + '|' + item.date;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function toISODate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function summary() {
    return {
      verifiedOn: VERIFIED_ON,
      total: TOOLS.length,
      guides: GUIDES.length,
      updates: UPDATES.length,
      categories: categoriesWithCounts(),
      access: accessCounts(),
      kinds: kindCounts()
    };
  }

  return {
    VERIFIED_ON: VERIFIED_ON,
    ACCESS_CLASSES: ACCESS_CLASSES,
    CATEGORIES: CATEGORIES,
    KINDS: KINDS,
    VERIFICATION_STATUSES: VERIFICATION_STATUSES,
    TOOLS: TOOLS,
    GUIDES: GUIDES,
    UPDATES: UPDATES,
    RECURRING_DUE_DATES: RECURRING_DUE_DATES,
    COMPARE_FIELDS: COMPARE_FIELDS,
    search: search,
    getById: getById,
    getGuideById: getGuideById,
    accessLabel: accessLabel,
    categoryLabel: categoryLabel,
    kindLabel: kindLabel,
    verificationLabel: verificationLabel,
    categoriesWithCounts: categoriesWithCounts,
    accessCounts: accessCounts,
    kindCounts: kindCounts,
    related: related,
    compare: compare,
    nextDueDates: nextDueDates,
    summary: summary
  };
});
