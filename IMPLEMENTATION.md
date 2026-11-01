# Implementation notes — TaxMitra GST billing, ITR wizard & tooling

This document records what was built, how the calculations work, what is deliberately
**not** implemented, and how to verify any of it. It is written to be read alongside the
code, not instead of it.

Last updated: 2026-10-31 · Branch: `arena/3f484b82-itr-and-gst` (merged to `main`, deployed)

---

## 1. What this build adds

| Area | Files | What it does |
|---|---|---|
| GST engine | `js/gst-billing.js` | Pure calculation library: money in paise, GSTIN validation with the mod-36 check digit, line/invoice totals, CGST/SGST/IGST split, round-off, amount in words, rate-wise and HSN summaries, invoice validation, GSTR-1 working-paper CSV, ageing buckets |
| Income tax engine | `js/income-tax.js` | Pure calculation library: FY 2024-25 → 2026-27 slabs for both regimes, HRA, house property, Chapter VI-A with caps, 87A rebate + marginal relief, surcharge + marginal relief, cess, capital-gains special rates, regime comparison, advance-tax schedule, 234B/234C, ITR-1…ITR-7 recommendation |
| Storage | `js/tm-store.js` | Thin, defensive `localStorage` wrapper with namespacing, corruption tolerance, quota handling, export/import |
| Billing app | `pages/billing.html`, `js/billing-app.js` | Dashboard, invoice editor, invoice list, customers, items, settings, print/PDF, backup and GSTR-1 export |
| ITR wizard | `pages/itr-form.html`, `js/itr-form.js` | Seven-step wizard, live validation, both-regime comparison, advance-tax view, review, JSON working paper, draft autosave |
| Directory | `pages/github-tools.html`, `js/github-tools.js` | 25 open-source projects, each verified through the GitHub API, with licence and maintenance caveats and client-side search |
| Admin | `pages/admin.html`, `js/admin.js` | Storage sizes, backup/restore, integrity check, demo seeding, wipe |
| Tests | `tests/` | 197 unit tests / 1,935 assertions plus a 36-check browser smoke test |

Navigation: `index.html` links all four new pages under **More → Free tools**.

---

## 2. Design decisions

**Pure engines, dumb UIs.** `gst-billing.js` and `income-tax.js` touch no DOM, no storage
and no network. That is why they can be tested exhaustively in Node and reused by the
billing app, the ITR wizard, the admin console and the tests with no duplication.

**Money is integer paise.** Every total is computed as `Math.round(value * 100)` and only
converted back at the end, so `₹0.1 + ₹0.2` style drift cannot reach an invoice. The
conversion uses the exponent-shift trick (`Number('1.005e2') === 100.5`) because
`1.005 * 100 === 100.49999999999999` rounds the wrong way.

**Odd paise never vanish.** When splitting GST intra-state, CGST is `floor(tax / 2)` and
SGST takes the remainder, so `CGST + SGST` always equals the total tax exactly.

**The editor never aliases the store.** `saveInvoice()` validates a *copy* and only then
replaces the stored record. (An earlier version mutated the saved invoice while the user
typed, so a rejected save silently corrupted the invoice — now covered by a smoke test.)

**Everything is local.** There is no server, no account and no telemetry. The trade-off is
that clearing site data destroys the books, which is why every page pushes the user toward
backups and `pages/admin.html` exists.

---

## 3. Tax rules implemented (and their basis)

### 3.1 Slabs

**New regime (section 115BAC)** — FY 2025-26 and FY 2026-27 (Budget 2026 made no change):

| Slab | Rate |
|---|---|
| 0 – 4,00,000 | Nil |
| 4,00,001 – 8,00,000 | 5% |
| 8,00,001 – 12,00,000 | 10% |
| 12,00,001 – 16,00,000 | 15% |
| 16,00,001 – 20,00,000 | 20% |
| 20,00,001 – 24,00,000 | 25% |
| Above 24,00,000 | 30% |

FY 2024-25 uses the previous six-slab table (nil up to ₹3 lakh) — kept because users still
file old years.

**Old regime** — 2.5L / 5L / 10L for under-60; 3L / 5L / 10L for 60–79; 5L / 10L for 80+.

### 3.2 Rebate u/s 87A

* New regime: total income ≤ ₹12,00,000 → rebate up to ₹60,000 (equals the slab tax at
  ₹12 lakh, so the effective zero-tax limit is ₹12 lakh; ₹12.75 lakh for salaried after the
  ₹75,000 standard deduction).
* Old regime: total income ≤ ₹5,00,000 → rebate up to ₹12,500.
* **Marginal relief** above the new-regime threshold: tax is capped at `income − ₹12,00,000`,
  so ₹12,10,000 pays ₹10,000 (not ₹61,500). The relief fades out by about ₹12.75 lakh.
  Verified in tests: ₹12,10,000 → ₹10,400 including 4% cess.
* The rebate is applied to **slab-taxed income only** and is available to **residents only**;
  non-residents and special-rate income get nothing (tested).

### 3.3 Surcharge and marginal relief

10% above ₹50 lakh, 15% above ₹1 crore, 25% above ₹2 crore; 37% above ₹5 crore in the old
regime but **capped at 25%** in the new regime. Marginal relief caps `tax + surcharge` at
`(tax at the threshold + income above the threshold)`. Tested at the ₹50 lakh boundary: an
extra ₹1 lakh of income produces tens of thousands of rupees of tax, not a full surcharge slab.

### 3.4 Salary, house property, deductions

* Standard deduction ₹75,000 (new) / ₹50,000 (old), capped at the salary itself.
* HRA exemption = least of (actual HRA, rent − 10% of basic+DA, 50%/40% of basic+DA).
* Professional tax ₹2,500 — old regime only.
* Self-occupied interest capped at ₹2,00,000; let-out property gets 30% standard deduction;
  total house-property loss set-off capped at ₹2,00,000.
* Old regime caps: 80C ₹1.5L, 80CCD(1B) ₹50k, 80D ₹1L, 80TTA ₹10k (under 60), 80TTB ₹50k
  (60+). The new regime allows only 80CCD(2) (employer NPS, 14% of basic+DA) and the family
  pension deduction — everything else is ignored, and a warning says so.

### 3.5 Capital gains

STCG 111A 20%, LTCG 112A 12.5% with ₹1,25,000 exempt, other LTCG 112 12.5%, lottery 30%.
Chapter VI-A deductions cannot reduce special-rate income, and the rebate is restricted to
slab income. Gains are entered **gross of indexation/exemptions**; the wizard says so.

### 3.6 Advance tax and interest

Instalments 15% / 45% / 75% / 100% by 15 June, 15 September, 15 December and **15 March of
the following calendar year** (this date bug was caught by the test suite). Advance tax is
not applicable below ₹10,000. 234B applies only when less than 90% was paid; 234C uses the
supplied shortfall and months at 1% per month.

---

## 4. GST rules implemented

* **GSTIN**: 15-character pattern, state code must be a real GST state code, characters 3–12
  must form a valid PAN, and the 15th character must match the mod-36 check digit. `25` and
  `28` (retired codes) are rejected; `26`, `38` and `97` are accepted.
* **Slabs**: 0/5/12/18/28/40. GST 2.0 (22 September 2025) rationalised rates to 5/18 plus a
  40% demerit slab, but 12% and 28% still apply to specific notified entries, so they stay
  selectable with a note to verify against the HSN.
* **Split**: same seller/buyer state → CGST + SGST; different states → IGST. Derived from the
  state codes, overridable, and the invoice is validated if the place of supply disagrees with
  the buyer's GSTIN state.
* **Round-off**: nearest rupee, shown as an explicit line, switchable off.
* **GSTR-1 export**: B2B (rate-wise, per invoice), B2C (summarised by place of supply and
  rate) and HSN summary sections, CRLF line endings, RFC-style quoting. The file header
  literally says it is a working paper and not a GSTN upload file.

---

## 5. Data model (browser `localStorage`)

| Key | Contents |
|---|---|
| `tm-billing-settings` | Business name, GSTIN, PAN, address, state, bank, invoice prefix, terms, inclusive-price flag |
| `tm-billing-customers` | `{ id, name, gstin, state, email, phone, address }` |
| `tm-billing-items` | `{ id, name, hsn, rate, gstRate }` |
| `tm-billing-invoices` | `{ id, invoiceNumber, invoiceDate, dueDate, buyer*, lines[], status, computed{}, createdAt }` |
| `tm-billing-counter` | `{ value }` — the monotonic invoice counter |
| `tm-itr-draft` | `{ savedAt, state }` — the wizard draft, debounced 400 ms |

`computed{}` stores the totals at save time so `admin.html` can detect drift if a line item
was later changed by hand.

**Backup format**: `{ app: "TaxMitra", formatVersion: 1, exportedAt, data: { <key>: <value> } }`.
Restore validates the shape, refuses files over 5 MB, and asks before replacing anything.

---

## 6. Testing

```bash
npm test              # 496 unit tests · 3,277 assertions (no dependencies)
npm test -- gst       # only gst-billing.test.js
npm install --no-save jsdom
node tests/smoke.js   # 91 browser checks driving the real pages
node tests/pages-load.js  # all 65 pages must start without throwing
```

| File | Focus |
|---|---|
| `tests/gst-billing.test.js` | Money helpers, words, GSTIN (incl. check digit), slabs, line/invoice maths, round-off, CSV, ageing |
| `tests/income-tax.test.js` | Every slab boundary, 87A + marginal relief, surcharge + relief, HRA, caps, gains, comparison, advance tax, ITR-form choice |
| `tests/tm-store.test.js` | Round-trips, corrupt JSON, quota failure, backup/restore, clearing |
| `tests/github-tools.test.js` | 25 entries, unique URLs, required fields, filters, sort order, no mutation |
| `tests/pages.test.js` | Broken script/link references, duplicate ids, script load order, missing DOM hooks, disclaimers, `aria-live`, print support, and a **no-fabricated-data** guard (no demo seeder, no fake 26AS/OCR output, no credential form, no baked-in token) |
| `tests/github-auth.test.js` | Device flow polling (`pending`, `slow_down`, `expired_token`, `access_denied`, `device_flow_disabled`), PAT verification and 401/403 handling, role resolution, session save/restore/refresh/sign-out, per-account data isolation |
| `tests/handlers.test.js` | Every one of the 559 inline handlers across 59 pages resolves to a real definition; no shipped page hardcodes `localhost`; no dead `href="#"` in the primary pages |
| `tests/smoke.js` | Homepage chat answers and escapes input, create/save/reject an invoice, mark paid, print, add customer, walk the ITR wizard end to end, search the directory, admin role gating, GitHub sign-in (device flow + PAT) on the account page, AIS/26AS/Form 16 real entry and validation |
| `tests/gst-recon.test.js` | CSV/TSV parsing, invoice + GSTIN + date normalisation, matching buckets, tolerance and date window, Rule 88A order, CSV export |
| `tests/itr-schema.test.js` | Validation rules (formats, caps, regime disallowances, Schedule FA), FY↔AY mapping, engine parity, "never claims to be filed" |
| `tests/ai-verify.test.js` | Number extraction from prose, income parsing (lakh/crore/₹), verdicts (`verified` / `differs` / `unchecked`), tolerance, badge safety |
| `tests/schedule-fa.test.js` | Rule 115 conversion, peak/closing sanity, per-country totals, checklist, CSV, wizard fragment, ITR-JSON integration |
| `tests/pages-load.js` | Loads all 65 pages with their local scripts and fails if any page throws while starting up |

The suite caught four genuine defects during development: float rounding in `toPaise`,
the 15-March instalment landing in the wrong year, the editor aliasing the stored invoice,
and a duplicate-id navigation bug in the wizard.

---

## 7. Verified open-source directory

`js/github-tools.js` holds 25 projects. Each was queried through the **GitHub REST API on
2026-10-31** and the stars, forks, licence, language, last-push date and archived flag in the
file come from that response — they are not remembered values. Re-check before depending on
them; they drift.

Honesty rules applied on the page:

* Two projects ship **no licence file** (`kskarthik/indian-fincodes-api`,
  `karthi-21/HSN-Code-Package`). They are labelled `NO LICENSE FILE` and the UI says that
  default copyright applies, i.e. read-only reference, not a dependency.
* `Nootus/OpenTax` is flagged: last push April 2026 and its demo was unreachable in the
  previous review. Demo links were **not** reachability-tested here, because only github.com is
  reachable from the build environment — the page says exactly that.
* Self-declared project states (alpha/beta) come from each project's own README.

---

## 8. Known limitations — read before relying on this

1. **No filing, no IRN, no portal integration.** Nothing here talks to the GST portal or the
   Income Tax portal. Returns are filed by the taxpayer on the official portals.
2. **GSTR-1 CSV is a working paper**, not the GSTN upload schema. Field order and mandatory
   checks of the official utility are not replicated.
3. **Not a substitute for a CA.** 80G approval limits, clubbing, foreign tax credit, 10-IEA
   opt-outs, audit thresholds, presumptive eligibility edge cases and state-specific
   professional tax are simplified or ignored. The wizard lists these as warnings.
4. **Individual/HUF focus.** Firm, LLP, company and trust rates are not modelled; only the
   *form recommendation* covers them.
5. **Data is per-browser.** No sync, no multi-device, no multi-user. Clearing site data
   removes everything — back up from `pages/admin.html`.
6. **No e-invoice/e-way bill generation.** The directory points to projects that do this.
7. **Slab data is hard-coded** in `js/income-tax.js`. A Finance Act change needs a new
   `FINANCIAL_YEARS` entry plus tests; the admin console warns when the current FY is missing.
8. **Rates are indicative.** HSN-level tax rates change by notification; the tool computes
   with the rate the user selects and does not second-guess it.

---

## 9. How to extend

**New financial year**: add an entry to `FINANCIAL_YEARS` in `js/income-tax.js` (copy the
nearest year, adjust slabs/rebate), add its boundary tests to `tests/income-tax.test.js`, and
add an `<option>` in `pages/itr-form.html`.

**New deduction**: add the cap to `DEDUCTION_CAPS`, an `add(...)` call in `applyDeductions`
for the correct regime, a bound input in the wizard, and a cap test.

**New GST rate or slab change**: edit `GST_SLABS` in `js/gst-billing.js` and the `<select>`
options in `pages/billing.html` and the item form; `isValidRate` follows automatically.

**New page**: follow the existing pattern (nav with `#themeToggle`, `page-hero`, container,
`../css/taxmitra.css`, local scripts at the end), then extend `tests/pages.test.js` — it
checks script references, duplicate ids and load order automatically.


---

## 10. Deployment and the live site

**Live URL:** <https://abhishekagrahari307-max.github.io/ITR-AND-GST/>

### How a deploy happens

1. A pull request from `arena/3f484b82-itr-and-gst` is merged into `main`.
2. The push to `main` triggers `.github/workflows/deploy.yml` ("Inject Keys + Deploy").
3. The workflow runs `node build.js`, which reads `GEMINI_API_KEY` and
   `OPENROUTER_API_KEY` from repository secrets and regenerates `js/config-generated.js`.
4. `actions/upload-pages-artifact` packages the repo and `actions/deploy-pages` publishes it.

Because the keys are injected at build time, **`js/config-generated.js` must never be
edited by hand** — the next deploy overwrites it. To change the AI keys, update the
repository secrets and re-run the workflow.

### Watch out for this

The Pages *source* field still reads `arena/019fabf8-itr-and-gst` (a leftover from the
previous setup). Deploys are driven by the workflow, not that field — but the old branch is
also listed in the workflow's `push` trigger, so **a push to `arena/019fabf8-itr-and-gst`
would republish the older content and temporarily hide this work**. Retire that branch (or
remove it from the workflow trigger) to prevent it.

### Local preview

```bash
npm run serve          # python3 -m http.server 8080 → http://localhost:8080
```

No build step is needed for local work: with an empty `config-generated.js` the AI features
fall back to their rule-based answers, which is the same experience a visitor gets until a
key is configured.

### What is genuinely live vs. simulated

| Works live with no backend | Needs the NestJS backend (`backend/`) |
|---|---|
| GitHub sign-in (device flow + personal access token), roles, per-account local profiles, billing, ITR wizard, directory, admin console, calculators, GST/TDS pages, ledger, client CRM, document vault, all localStorage tools | Cloud-synced data (server-side accounts, multi-device books). The `js/api.js` helper throws a typed `BACKEND_UNAVAILABLE` instead of pretending to save. |

Still explicitly labelled as simulated on the page itself: e-invoice IRN generation
(`pages/einvoice.html` shows a `Status: SIMULATED` badge). Everything filing-related remains
a working paper or a guide, never an official submission.

## 11. Authentication — real GitHub sign-in

There is **no password form anywhere in this site**, and no mock auth. Identity comes from
GitHub itself, in two supported ways. The whole engine is one dependency-free file,
`js/github-auth.js` (~430 lines, UMD, works in the browser and under Node for tests).

### 11.1 Method A — OAuth **device flow** (recommended)

1. GitHub → Settings → Developer settings →
   [OAuth Apps → New OAuth App](https://github.com/settings/applications/new).
2. Homepage URL: the live site (`https://abhishekagrahari307-max.github.io/ITR-AND-GST/`).
   The callback URL is irrelevant for device flow — device flow never uses it.
3. In the app's settings tick **Enable Device Flow**.
4. Copy the **Client ID** only. The client **secret** must never be used here: it cannot be kept
   in a static site, and device flow does not need it.
5. Open `pages/account.html` → *Setup* → paste the client ID → **Save client ID**. It is stored in
   that browser under `tm-gh-client-id` (public value, safe to share).

Flow used: `POST https://github.com/login/device/code` → user sees a `user_code` and opens
`https://github.com/login/device` → the page polls `POST https://github.com/login/oauth/access_token`
with `grant_type=urn:ietf:params:oauth:grant-type:device_code`, honouring
`authorization_pending`, `slow_down` (+5 s), `expired_token`, `access_denied` and
`device_flow_disabled`.

Nothing about a client ID is baked into the repository, so every deployment has to save its own —
that is why the page prompts for it instead of hardcoding one.

### 11.2 Method B — personal access token

Works with **zero setup** and needs no OAuth App. The visitor creates a token at
`https://github.com/settings/tokens` (classic: `read:user` is enough; fine-grained: no permissions
needed) and pastes it. It is verified immediately with `GET https://api.github.com/user`, so a
revoked or mistyped token fails honestly with `401 Bad credentials` instead of "succeeding".

### 11.3 Roles

| Role | How it is decided |
|---|---|
| **Administrator** | The GitHub login is in `DEFAULT_ADMINS` (`['abhishekagrahari307-max']`), **or** the token reports `admin` permission on `DEFAULT_REPO` (`abhishekagrahari307-max/ITR-AND-GST`). |
| **User** | Any other authenticated GitHub account. |
| **Guest** | Not signed in — everything still works, and the local books are the visitor's own. |

Roles are a UI convenience, not server-side security: this is a static site with no server, so
"admin" unlocks the destructive buttons in `pages/admin.html` (restore-over-everything, wipe) and
that is all it does. Those two actions are disabled for guests and for non-admin users, with the
reason shown on the page.

### 11.4 Sessions and per-account data

- "Keep me signed in" → `localStorage['tm-gh-session']`; otherwise `sessionStorage['tm-gh-session-tmp']`
  (tab-only). Both are cleared by **Sign out**.
- `js/session-boot.js` runs before any data script, reads the session and calls
  `TMStore.setNamespace('gh-<login>')`. Every store key therefore becomes
  `tm-gh-<login>-billing-invoices` etc., so two people sharing one browser never see each other's
  invoices, customers or drafts. Signed-out visitors keep using the original `tm-*` keys, so
  existing books keep working untouched.
- `pages/account.html` offers a one-time **Copy into my account** action
  (`TMStore.migrateNamespace('', 'gh-<login>')`) that copies signed-out data into the account.
  It never overwrites data the account already has.

### 11.5 Security caveats — read these

- A token in a browser can be read by any script that manages to run on this origin. Treat XSS as
  a real risk; never paste a token you cannot rotate.
- Revocation only happens on GitHub: [Settings → Applications](https://github.com/settings/applications).
  A static site cannot revoke a token, because that needs the client secret.
- Nothing is sent anywhere except `github.com` and `api.github.com`. There is no backend, so no
  server ever sees the token.
- The default scope requested is `read:user`; repository scope is optional and only used to detect
  repository admin rights.

### 11.6 Tests

`tests/github-auth.test.js` (36 tests) mocks `fetch` through `setFetch()` and covers pending →
approved polling, `slow_down`, `expired_token`, `access_denied`, `device_flow_disabled`, `401`
revoked tokens, rate limiting, malformed tokens, admin-by-login, admin-by-repository-permission,
session save/restore/refresh/sign-out and namespace isolation. `tests/smoke.js` additionally drives
`pages/account.html` in jsdom: the client-ID gate, a full device-flow sign-in, PAT sign-in, the
role badges, sign-out, and a check that no client secret or baked-in token exists in the page.

## 12. ITC reconciliation — GSTR-2B ↔ purchase register

`pages/itc-recon.html` · engine `js/gst-recon.js` (`TMGSTRecon`) · controller `js/itc-recon.js`

Paste the purchase register and the GSTR-2B export (CSV or tab-separated, any of the usual header
spellings), press **Reconcile**, and each line lands in exactly one bucket:

| Bucket | Meaning | Effect on the claim |
|---|---|---|
| Matched | GSTIN, invoice number and every tax head agree | Confirmed ITC |
| Value mismatch | Same invoice, different taxable value | Under review |
| Tax mismatch | Taxable value agrees, IGST/CGST/SGST do not | Under review |
| Only in books | The supplier has not filed it | At risk — cannot be claimed yet |
| Only in 2B | Not recorded in the books | Not in books — investigate |

- Invoice numbers are compared after stripping punctuation, case and leading zeros
  (`INV/2026-27/001` matches `INV-2026-27-001`); dates accept `DD/MM/YYYY`, `DD-MM-YY` and ISO.
- Tolerances default to ₹1 per head (`options.valueTolerance` / `taxTolerance`) with an optional
  date window (`options.dateWindow`, 0 = ignore dates).
- When the invoice number differs, likely counterparts are suggested (same GSTIN, total within
  ₹2) instead of silently declaring a mismatch.
- **Rule 88A set-off**: IGST credit → IGST, then CGST, then SGST; CGST credit → CGST, then IGST;
  SGST/UTGST credit → SGST, then IGST; cess only against cess. The calculator deliberately uses
  **confirmed** credit only, so a disputed or at-risk invoice can never reduce the cash figure.
- Output: KPI cards, 2B-vs-books head comparison, per-bucket tables, CSV export titled as a
  working paper. `Fill from my saved invoices` builds the register from the real invoices stored
  by the billing page (only those that carry a supplier GSTIN).

## 13. ITR JSON export and validation

`js/itr-schema.js` (`TMITRSchema`) · wired into wizard step 7

- `validate(state)` returns `{ ok, errors[], warnings[] }`; every finding carries its section
  (`PersonalInfo`, `Income`, `Deductions`, `TaxesPaid`, `ScheduleFA`, `Filing`). Errors block
  meaningful filing, warnings are advisory — over-claiming a deduction cap, for example, is a
  warning because the engine caps it anyway.
- Checks include PAN/Aadhaar/IFSC formats, supported financial year, FY↔AY mapping, negative
  figures, HRA versus salary, deduction caps by section and age, Chapter VI-A inside the new
  regime, 80TTA/80TTB age eligibility, the ₹12,00,000–₹12,75,000 marginal-relief band, taxes paid
  versus computed liability, and Schedule FA completeness.
- `build(state)` returns a **department-shaped** document keyed by the recommended form
  (`ITR.ITR1…ITR7`) with `PersonalInfo`, `FilingStatus`, `IncomeDeductions`, `TaxComputation`,
  `ScheduleFA` and `Verification`. It always carries `submitted: false`, a disclaimer, the
  validation findings and `"Note": "Not verified — this working paper is not filed."`.
- Step 7 shows the panel, a **Re-run validation** button and **Export ITR JSON**, which asks for
  confirmation before writing a draft that has errors.

## 14. AI answer verification

`js/ai-verify.js` (`TMVerify`) · used by the homepage chat (`js/home-assistant.js`)

An LLM answer can be fluent and wrong. Every homepage answer that states a tax figure is now
machine-checked:

1. The income the question is about is parsed from the question (`12 lakh`, `1.5 crore`,
   `₹12,00,000`, `1200000`). A figure inside the answer is never treated as income.
2. The engine re-computes that income (`TMIT.computeTax`, total income = other income, so no
   standard deduction is invented) under the applicable regime.
3. The answer's own figure is compared with a ₹100 tolerance (rounded answers are not lies).

Verdicts: **✅ Engine-verified**, **⚠️ Engine disagrees** (both numbers are shown), or no badge at
all when there is nothing checkable. No API key is involved — the check is deterministic, offline
and testable.

## 15. Schedule FA (foreign assets)

`pages/schedule-fa.html` · engine `js/schedule-fa.js` (`TMScheduleFA`) · controller `js/schedule-fa-app.js`

- Asset types map to their schedule references: bank / custodial → A1, equity / RSU / ESPP → A2,
  anything else → A3.
- Amounts are entered in the **foreign currency**, with the **rule 115 rate** (SBI TT buying rate
  on 31 March of the previous year). The rupee value is `amount × rate`; a rate is never fetched
  or invented — a foreign amount without a rate is rejected with an explanation.
- Reports initial, **peak** and **closing** values (peak is never allowed below closing) and totals
  by country, because Schedule FA is a country-wise disclosure.
- A disclosure checklist covers the usual reasons a schedule gets questioned: missing country,
  missing entity, peak not filled, no rate recorded, income treatment unexplained.
- Export: CSV working paper, `Save on this browser`, and **Send to ITR wizard**, which writes
  `state.fa` and flips `profile.foreignAssets` so the ITR JSON export carries the schedule.

## 16. Contribution gate

`AGENTS.md` documents the project rules (no fabricated data, no fake submission, no secrets,
paise-only money, one tax engine) plus four review checklists: tax-domain, no-fabricated-data,
accessibility/responsive and security. `.github/workflows/ci.yml` runs `npm test`, scans for
tracked credential files and then runs both jsdom audits on every push and pull request — the
deploy workflow only builds and publishes.
