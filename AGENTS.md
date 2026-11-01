# AGENTS.md — working on TaxMitra

Guidance for any coding agent (or human) contributing to this repository. Read this before
changing anything: the rules below are the ones the project is judged on.

---

## 1. What this project is

A **static, browser-only** Indian tax toolkit published on GitHub Pages:
GST billing, an ITR preparation wizard, ITC reconciliation, Schedule FA, calculators,
a curated open-source directory, and a GitHub-authenticated account layer.

- No backend, no database, no server-side secrets. Everything a visitor enters is stored in
  `localStorage` (namespaced per GitHub account when signed in) and never leaves the browser.
- The `backend/`, `ai/`, `netlify/`, `cloudflare-worker.js` and `database/` directories are
  archived v10 material. **The published site does not use them.**

## 2. Non-negotiable rules

1. **No fabricated data.** The shipped site must start empty. No demo rows, no seeded invoices,
   no invented "fetched from the portal" tables, no `login bypass`, no hardcoded sample PANs or
   employer names in output. `tests/pages.test.js` → *“No fabricated data ships”* enforces this;
   extend it when you add a page.
2. **No fake submission.** Nothing may claim to file, submit, e-verify or e-sign anything. The
   ITR JSON export is a *working paper* (`submitted: false` + disclaimer inside the file). The
   e-invoice IRN stays labelled `SIMULATED`.
3. **No secrets in the repository.** No client secrets, API keys or tokens. The GitHub OAuth
   *client ID* is public and stored per browser; the *client secret* must never be used —
   device flow does not need it. `tests/pages.test.js` scans every page and script for
   `ghp_…`, `github_pat_…`, `gho_…` and `client_secret`.
4. **Money is integer paise.** Use `TMGST.toPaise` / `fromPaise` (`js/gst-billing.js`). Never
   compare floats directly; never round twice.
5. **Tax logic lives in one place.** Slabs, 87A, surcharge, cess and reliefs come from
   `js/income-tax.js` (`TMIT`). Never re-implement a slab inside a page or a test fixture.

## 3. Layout

| Path | What it holds |
|---|---|
| `js/income-tax.js` | `TMIT` – slabs, 87A + marginal relief, surcharge + relief, HRA, deductions, capital gains, advance tax, ITR-form recommendation |
| `js/gst-billing.js` | `TMGST` – paise helpers, GSTIN validation + check digit, invoice maths, CSV |
| `js/gst-recon.js` | `TMGSTRecon` – GSTR-2B ↔ purchase register matching, Rule 88A set-off |
| `js/itr-schema.js` | `TMITRSchema` – validation layer + department-shaped ITR JSON builder |
| `js/schedule-fa.js` | `TMScheduleFA` – foreign assets, rule 115 conversion, disclosure checklist |
| `js/ai-verify.js` | `TMVerify` – re-computes the figures an AI answer states |
| `js/tm-store.js` | `TMStore` – namespaced localStorage wrapper (per GitHub account) |
| `js/github-auth.js` | `TMGitHubAuth` – device flow + PAT, roles, sessions |
| `js/session-boot.js` | `TMSession` – resolves the session and sets the store namespace |
| `pages/*.html` | One page per tool; each page owns its controller (`js/<tool>-app.js` or `js/<tool>.js`) |
| `tests/*.test.js` | Node unit suites (no dependencies) |
| `tests/smoke.js` | jsdom run of the real pages (optional, needs `jsdom`) |
| `tests/pages-load.js` | Loads every page with its local scripts; fails on any startup error |

Modules follow the UMD pattern used across `js/`: `module.exports` in Node, `window.TM*` in the
browser. Pages load `taxmitra.js` → the tool module → `github-auth.js` → `tm-store.js` →
`session-boot.js` → the page controller.

## 4. Commands

```bash
npm test                      # all unit suites (fast, zero dependencies)
npm test -- gst-recon         # one suite
npm install --no-save jsdom   # needed for the two browser audits
node tests/smoke.js           # drives the real pages
node tests/pages-load.js      # every page must start clean
npm run serve                 # http://localhost:8080
```

`js/config-generated.js` is written by CI — never hand-edit it.

## 5. Review checklists

Run these before you open a pull request. Each maps to a real defect this project has shipped
before.

### 5.1 Tax-domain reviewer

- [ ] New slab / rebate / surcharge number is traceable to a Finance Act, and `IMPLEMENTATION.md`
      §3 or §4 records the basis.
- [ ] Boundary behaviour is tested: exactly ₹12,00,000; ₹12,00,001; ₹12,50,000; ₹5,00,000 old
      regime; a 60th and 80th birthday; one rupee over a surcharge threshold.
- [ ] Chapter VI-A caps match the Act (80C ₹1.5L, 80CCD(1B) ₹50k, 80D ₹25k/₹50k, 80TTA ₹10k,
      80TTB ₹50k) and are applied **after** the regime decision.
- [ ] Special-rate income (111A / 112A / 112 / 115BB) never receives a Chapter VI-A deduction or
      the 87A rebate.
- [ ] New GST logic respects Rule 88A order and keeps cess ring-fenced.

### 5.2 "No fabricated data" reviewer

- [ ] New page renders an honest empty state; no sample JSON in the HTML or the controller.
- [ ] New export carries a "working paper / not submitted" disclaimer.
- [ ] Anything that a portal would normally supply is either user-entered or clearly marked as
      unavailable ("this site cannot fetch 26AS").

### 5.3 Accessibility & responsive reviewer

- [ ] Every input has a `<label for>`; tables have `<thead>` and scoped headers.
- [ ] No horizontal overflow at 360 px, 768 px and 1024 px; tap targets ≥ 44 px.
- [ ] Text inputs are ≥ 16 px on mobile (stops iOS zoom-on-focus).
- [ ] `aria-live` on toast/status regions; errors are text, not colour alone.
- [ ] Print styles still work on the wizard and the computation.

### 5.4 Security reviewer

- [ ] User input is escaped before `innerHTML` (`esc()` in every controller).
- [ ] No token, key or personal figure is logged to the console.
- [ ] Destructive actions require an administrator (`TMSession.isAdmin()`).
- [ ] Sign-out clears the session **and** the store namespace.

## 6. Adding a tool

1. Pure logic in `js/<tool>.js` (UMD, no DOM), page controller in `js/<tool>-app.js`.
2. `pages/<tool>.html` loading the shared scripts in the documented order.
3. Unit suite in `tests/<tool>.test.js`; add a browser suite in `tests/smoke.js`.
4. Link it from `index.html` (nav + module card + footer free-tools column).
5. Document it in `IMPLEMENTATION.md` and update the counts in `README.md`.
6. `npm test`, `node tests/smoke.js`, `node tests/pages-load.js` — all green before the PR.

## 7. CI

`ci/github-actions-ci.yml` holds the workflow that runs the unit suites and both browser audits on
every push and pull request. It is stored outside `.github/workflows/` because automated agents do
not always hold the GitHub App `workflows` permission. To enable it:

```bash
cp ci/github-actions-ci.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml && git commit -m "ci: run tests on every PR" && git push
```

Until it is enabled, run the three commands from §4 locally before every merge — that is exactly
what the workflow runs.
