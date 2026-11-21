# TaxMitra server — accounts, sync, AI and government adapters

`server/` is a real backend you can run yourself. It is one Node process with **zero npm
dependencies**, and it serves the whole static site, so `npm start` gives you the complete app on
one origin.

This document is deliberately blunt about what is real, what needs credentials, and what is not
possible at all. If a feature cannot work, the server answers with a machine-readable error
instead of a convincing-looking fake.

---

## 1. Run it

```bash
# Node 18+ (SQLite driver needs Node 22.5+, otherwise it falls back to a JSON file)
openssl rand -hex 32                 # copy the output into JWT_SECRET
JWT_SECRET=… node server/index.js    # → http://localhost:3000

# or, with a .env-style shell block:
cp .env.example .env                 # fill in JWT_SECRET (and keys, if you have them)
npm start
```

Open <http://localhost:3000>. Every page is served from the same origin, and the pages pick the
server up automatically (`js/cloud.js` probes `/api/health`).

```bash
npm test          # 521 site + client tests
npm run test:server   # 18 server tests (real HTTP, real SQLite, fake AI upstream)
npm run test:all  # both
```

## 2. What is genuinely implemented

| Area | Endpoints | Status |
|---|---|---|
| Health & capabilities | `GET /api/health` | Real. Tells you exactly which features this deployment has. |
| Accounts | `POST /api/auth/register`, `/login`, `/logout`, `/password`, `GET /api/auth/me` | Real. scrypt-hashed passwords, HS256 JWT, server-side session rows, revocation on logout and on password change. |
| Cloud sync | `GET /api/sync`, `/api/sync/all`, `GET/PUT/DELETE /api/sync/doc/:key`, `POST /api/sync/bulk` | Real. Per-user documents, version numbers, 1 MB per document, 20 MB per account, strict key validation. |
| AI | `POST /api/ai/chat`, `POST /api/ai` | Real when a provider key exists. Gemini → OpenRouter → Groq → OpenAI-compatible, server-side only, per-IP and daily quotas. |
| E-invoice IRN | `POST /api/govt/einvoice/irn` | Real adapter for the NIC IRP (auth + IRN). Requires credentials. Without them: `501 GOVT_NOT_CONFIGURED`. |
| GST returns | `POST /api/govt/gst-return` | Real GSP call. Requires a GSP account. Without one: `501`. |
| ITR filing | `POST /api/govt/itr` | **Always `501 ITD_FILING_API_UNAVAILABLE`.** The department has no open filing API. Nothing is simulated. |
| Static site | everything else | Serves the repo, blocks `server/`, `data/`, dotfiles and path traversal. |

### Where the data lives

`DATA_DIR` (default `./data`) holds `taxmitra.db` (SQLite, WAL) or `taxmitra.json` when the
runtime has no `node:sqlite`. Both are real persistence with atomic writes; SQLite is the
recommended default.

## 3. Accounts and sync, in plain words

- One account = one email + one password, stored **on your server**. There is no TaxMitra central
  database and no third-party identity provider involved.
- Signing in does not upload anything by itself. The Cloud page shows what is on this device and
  what is in the account, and asks you to choose if both have data — it never guesses.
- Sync copies the `tm*` keys the tools write (invoices, customers, items, ITR drafts, ledgers).
  **`tm_keys`, OAuth tokens and the cloud token itself are never uploaded.**
- Conflicts are resolved by timestamp and reported; the loser is not silently deleted on the
  device that pushed later (the account page lists what happened).
- Signing out leaves the device copy in place. Clearing site data still destroys it — keep taking
  backups from `pages/admin.html`.

## 4. Turning on real AI for every visitor

Set **one** of these and restart:

```bash
GEMINI_API_KEY=…        # aistudio.google.com → free tier available
OPENROUTER_API_KEY=…    # openrouter.ai → several free models
GROQ_API_KEY=…
OPENAI_API_KEY=…        # plus OPENAI_BASE_URL for any compatible gateway
```

That is all. `js/cloud.js` sees `capabilities.ai: true` on `/api/health`, points the existing AI
boot path at the server, and every visitor gets real answers without typing a key. Keys stay in
the process environment and are never sent to the browser, never logged, and never written to the
repository.

Without a key the site keeps working on its local rule engine and labels itself as rule-based on
the Cloud page. It does not pretend to be a model.

Guardrails built into the server prompt (`server/prompts/tax-system.txt`): answer in the user's
language, show slab working, never invent figures/sections/dates, and state plainly that this
platform cannot file a return or generate an IRN.

Quotas: `AI_PER_HOUR_PER_IP` (default 40) and `AI_PER_DAY_GLOBAL` (default 2000). Raise them only
if you are paying for the traffic.

## 5. Government integrations — the honest version

**E-invoice (IRN).** The adapter implements the NIC IRP flow: `POST /eivital/v1.04/auth` with the
AES-256-ECB password encryption documented by NIC (first 32 characters of the client secret as the
app key), then `POST /eicore/v1.03/Invoice` with `AuthToken`/`Sek`. You need:

1. An IRP sandbox account — <https://einv-apisandbox.nic.in/> — or production credentials.
2. `GSTN_CLIENT_ID`, `GSTN_CLIENT_SECRET`, `GSTN_USERNAME` (the GSTIN), `GSTN_PASSWORD`.
3. `IRP_ENV=sandbox` while testing.

Send a **complete** e-invoice document (`Version`, `TranDtls`, `DocDtls`, `SellerDtls`,
`BuyerDtls`, `ItemList`). The server will not fill in missing fields or invent totals.

**GST returns (GSTR-1 / 3B / 9).** Filing runs through a GSP. Set the GSP base URL and credentials;
the adapter posts the department-shaped payload and returns the GSP's raw answer. A GSP contract is
provider-specific — check yours and adjust `server/lib/govt.js` if the paths differ.

**Income-tax returns.** There is no public API. A filing needs an ASP/eRI account, the department's
schema, and DSC/EVC by the taxpayer or their representative. The server answers `501` with that
explanation, and the ITR JSON this site produces stays labelled `submitted: false` — a working
paper, not a return.

**What the server will never do:** return a synthetic IRN, an acknowledgement number, a "filed"
status or a made-up portal response. `server/test/server.test.js` asserts this.

## 6. Deploying for free (and the catch)

Any host that runs Node works. The honest catch: **free tiers usually do not include a persistent
disk**, so a SQLite file can disappear on redeploy or restart.

| Host | Good for | Watch out for |
|---|---|---|
| Fly.io | small free allowance that includes volumes | you must attach a volume and set `DATA_DIR` to its mount path |
| Railway | quick deploy from this repo | free/trial credits; attach a volume for persistence |
| Render | simplest web service | free instances sleep and have ephemeral disks — fine for demos, not for real books |
| Koyeb / similar | container deploys | same disk caveat |
| Your own VPS | full control | you manage TLS and backups |

Generic steps:

1. Push this repository to GitHub (already the case).
2. Create a **Web Service** from the repo.
3. Build command: none (no dependencies). Start command: `node server/index.js`.
4. Environment: `NODE_ENV=production`, `JWT_SECRET` (64 hex chars), `DATA_DIR`, plus AI/GSTN keys
   if you have them.
5. Attach a volume if the host offers one, and point `DATA_DIR` at it.
6. Health check path: `/api/health`.

If you only want the static site, keep GitHub Pages as it is — every tool still works locally;
only accounts, sync, the server-side AI and the government adapters need the server.

**GitHub Pages + this server together.** Set `ALLOWED_ORIGINS=https://<your-pages-origin>` and add
`<script>window.TAXMITRA_API_URL='https://<your-server>/api'</script>` before `js/cloud.js` on the
pages you want to connect. Same-origin (this server serving the site) needs no configuration at
all.

## 7. Security notes

- Passwords: scrypt (N=16384, r=8, p=1) with a random 16-byte salt, constant-time verification.
- Login and registration are rate-limited per IP; login failures return the same message and take
  the same time whether or not the account exists.
- Tokens: HS256, 30 days by default, revocable server-side. Stored in `localStorage` by the client,
  so **serve over HTTPS** — a hosting platform gives you that for free.
- State-changing API calls reject foreign `Origin` headers unless listed in `ALLOWED_ORIGINS`.
- `server/`, `data/`, `.git` and dotfiles are never served. Path traversal is rejected.
- No secret is ever read from the repository; `.env` and `data/` are git-ignored.
- Back up the database file (or the JSON store) like you would any book of accounts. There is no
  managed backup service here.

## 8. Limitations you should know before trusting it

- No email verification, no password reset by email, no 2FA. If you need them, add them — the
  session table is already there.
- Sync is last-writer-wins per document with a conflict report, not a CRDT. Two people editing the
  same invoice offline will produce a conflict, and the account page shows which copy won.
- The AI is a general model with a tax prompt. It is not a computation engine; figures you rely on
  must come from `js/income-tax.js`, which re-computes and marks answers *engine-verified*.
- Government adapters are written against published NIC/GSP contracts but can only be proven with
  your credentials. Test in sandbox first.
