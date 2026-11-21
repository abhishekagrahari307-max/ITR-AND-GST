# CA Practice Hub India

The CA Practice Hub is a static, browser-only discovery and workflow area in TaxMitra. It is a directory and local practice organiser, **not** an official portal mirror, e-filing intermediary, live compliance feed, secure multi-user client system, or replacement for tax/professional advice.

## Pages

- `pages/ca-hub.html` — searchable/filterable 24-entry directory, favourites, and compare tray.
- `pages/ca-hub-tool.html?id=<tool-id>` — one tool/API detail page, links, limitations, source date, local issue report.
- `pages/ca-hub-compare.html` — feature/access comparison (up to three tools), explicitly not a best-tool ranking.
- `pages/ca-hub-guides.html` — curated workflow guides and related source links.
- `pages/ca-hub-updates.html` — dated catalog log and calculated recurring-date reminders. Not a live notice service.
- `pages/ca-workspace.html` — generic local reminder list and JSON backup/restore; begins empty and does not collect client data.
- `pages/ca-hub-policy.html` — privacy, terms, contact, issue-reporting and deletion information.

## Data and honest labels

`js/ca-hub.js` exports `TMHub` in browsers and CommonJS. The catalog model includes `id`, `name`, category, provider, summary, use cases, `kind`, `accessClass`, auth/approval/consent, production status, sandbox/docs/homepage/repository URLs, licence, pricing, rate limit, data sensitivity, supported workflows, limitations, source URLs, `lastVerifiedAt`, verification status and curator notes.

All 24 catalog entries have an HTTPS source, access class, limitation and checked date. Access badges are defined once in `ACCESS_CLASSES`: `public-open`, `key-required`, `approval-consent`, `partner-eri`, `self-hosted`, `paid-vendor`, `sandbox-only`, and `no-api`. `github-verified` is only used for repo metadata copied from the GitHub REST-API-verified open-source list; unreviewed entries are marked `curator-listed`, and official links use `official-source-linked`. These labels are not provider security certifications or guarantees of current availability.

The e-Filing ERI listing is not labelled public and records approval/consent requirements. The e-Invoice sandbox is sandbox-only and expressly not production. Commercial products are references; no unrestricted commercial API is implied. GitHub stars are not proof of correct tax calculations. Catalog order is editorial, not a ranking.

### Updating the catalog

1. Check the provider's official documentation, terms, licence, access/approval and sandbox-vs-production status. Do not infer an API from a website or README.
2. Check a public repository's activity and licence from GitHub's API. Only carry repo metadata into a record after checking the repository itself; otherwise keep `curator-listed` and explain the unknowns.
3. Update the record's `lastVerifiedAt`, `verificationStatus`, `curatorNotes`, `sourceUrls` and `limitations` together. Each record requires a source link and plain-language limitation.
4. Do not include keys, client IDs/secrets, credentials, PAN/Aadhaar, GST return data, bank details, or client records in catalog data or browser scripts.
5. Add updates only for actual catalog edits or checks; do not claim live portal or API testing unless it was actually done.
6. Check deadline rules against the official department. The current rules are a planning aid: extensions, taxpayer type and notifications may change the date.

## Generic reminder list design

`js/ca-workspace.js` is a pure UMD logic module; `js/ca-workspace-app.js` is its DOM controller. Storage key: `tm-cahub-workspace-v2`. It starts empty and holds only generic reminder tasks and a bounded activity array. There is no client list, client reference field, GSTIN/PAN/contact field, login, encryption, team permission or server sync. The controller also removes the previous prototype's `tm-cahub-workspace` key on load, rather than importing any legacy client records. This generic reminder feature explicitly does **not** satisfy the secure client-workspace requirement; do not put client names or details in reminder titles/checklists. Client-specific records must remain in an appropriately secured system behind access control.

Favourites (`tm-cahub-favourites`), compare tray (`tm-cahub-compare`) and locally saved issue reports (`tm-cahub-reports`) also use localStorage. Nothing in these new modules makes network requests or transmits these values. This does **not** mean browser localStorage is encrypted, access-controlled or reliably backed up. Backups are plain JSON and should contain only generic reminders; protect them yourself. Deletion is available in the reminder page or through browser site-data settings.

No public API keys/client IDs are embedded. No government portal credentials, scraping or return submission is implemented. A real regulated/multi-user integration would need a properly secured backend, per-user permissions, consent, audit logging, secret management and vendor/official approval; that is out of scope here.

## Issue reports, policies and support

The per-entry report form saves a report locally in the current browser only, because this static project has no submission backend. The page says so and links users to the public GitHub repository to contact the maintainer. Avoid posting client or secret data in issues. `pages/ca-hub-policy.html` explains local storage, external CDN/request caveats, data deletion and the scope limits.

## Verification commands

```sh
npm test -- ca-hub
npm test
npm run serve
```

`tests/ca-hub.test.js` checks catalog completeness and honest access labels, search/compare/date logic, generic reminder create/update/delete/checklist/backup behaviour and page policy requirements. `tests/pages.test.js` enforces that `pages/index.html` includes each tool page exactly once; add a catalog entry there whenever adding another `pages/*.html` page.
