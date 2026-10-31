# Implementation notes — TaxMitra GST billing, ITR wizard & tooling

This document records what was built, how the calculations work, what is deliberately
**not** implemented, and how to verify any of it. It is written to be read alongside the
code, not instead of it.

Last updated: 2026-10-31 · Branch: `arena/3f484b82-itr-and-gst`

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
npm test              # 197 unit tests · 1,935 assertions (no dependencies)
npm test -- gst       # only gst-billing.test.js
npm install --no-save jsdom
node tests/smoke.js   # 36 browser checks driving the real pages
```

| File | Focus |
|---|---|
| `tests/gst-billing.test.js` | Money helpers, words, GSTIN (incl. check digit), slabs, line/invoice maths, round-off, CSV, ageing |
| `tests/income-tax.test.js` | Every slab boundary, 87A + marginal relief, surcharge + relief, HRA, caps, gains, comparison, advance tax, ITR-form choice |
| `tests/tm-store.test.js` | Round-trips, corrupt JSON, quota failure, backup/restore, clearing |
| `tests/github-tools.test.js` | 25 entries, unique URLs, required fields, filters, sort order, no mutation |
| `tests/pages.test.js` | Broken script/link references, duplicate ids, script load order, missing DOM hooks, disclaimers, `aria-live`, print support |
| `tests/smoke.js` | Create/save/reject an invoice, mark paid, print, add customer, walk the ITR wizard end to end, search the directory, seed/verify/clear the store |

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
