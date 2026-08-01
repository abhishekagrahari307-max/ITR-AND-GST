# TaxMitra Enterprise — Phase 1 Architecture
**Developer:** Abhishek Agrahari | Kanpur, UP  
**Date:** 2026-08-01  
**Status:** Phase 1 Complete | Phase 2 In Progress | Phase 3 Skeleton Built

---

## Stack (Realized in Phase 1)

| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend | Vanilla HTML/CSS/JS (45 pages, GitHub Pages) | ✅ Live |
| Backend API | NestJS + TypeScript + Node 20 | ✅ Built (in-memory) |
| Database | PostgreSQL 15 + Prisma ORM | ✅ Schema + Seed |
| Cache/Queue | Redis 7 | ✅ Config ready |
| AI Engine | Gemini 2.5 Flash + Tesseract OCR | ✅ Phase 2 |
| Auth | JWT + 2FA + RBAC | ✅ Schema (Phase 4 JWT) |
| Security | Helmet + CORS + AES-256 | ✅ Configured |
| CI/CD | GitHub Actions (14 steps) | ✅ ci.yml |

---

## Module Mapping (Repo → Enterprise)

| Repo File | Phase | Enterprise Path |
|-----------|-------|----------------|
| `index.html` + 44 pages | 1 (UI) | Static frontend (GitHub Pages) |
| `pages/itr-center.html` | 1 | `tax-engine/src/itr-validator.ts` |
| `pages/gst.html` | 1 | `backend/src/gst/` |
| `pages/calculators.html` | 1 | `backend/src/tax-file/tax-file.service.ts` (quickCompute) |
| `pages/ai-assistant.html` | 2 | `ai/src/gemini-client.ts` |
| `pages/accounting.html` | 3 | `backend/src/accounting/` |
| `pages/compliance.html` | 3 | `backend/src/compliance/` |
| `pages/client-crm.html` | 3 | `backend/src/practice/` |
| `login.html` / `signup.html` | 4 | Firebase Auth + JWT (Phase 4) |

---

## API Endpoints (Phase 1)

### Validation Engine (1000+ Rules Skeleton)
```
GET  /api/validation/categories   → 6 categories with rule counts
POST /api/validation/check        → Run rules for single category
POST /api/validation/check-all    → Full validation across all 6 categories
GET  /api/validation/rules/:id    → Get specific rule detail
```

### Tax Filing (ITR Engine)
```
POST /api/tax-files               → Create ITR Draft
GET  /api/tax-files               → List filings (filter: userId/status/ay)
GET  /api/tax-files/:id           → Get filing + validation history
PATCH /api/tax-files/:id          → Update status/submit
DELETE /api/tax-files/:id         → Delete draft
POST /api/tax-files/:id/validate  → Run 1000+ rules on filing
POST /api/tax-files/:id/compute   → Compute tax (Budget 2025)
GET  /api/tax-files/compute/preview → Quick tax preview (no DB)
```

### GST Suite
```
POST /api/gst-returns             → Create GSTR-1/3B/9/9C
GET  /api/gst-returns             → List returns
GET  /api/gst-returns/:id         → Get + ITC reconciliation
PATCH /api/gst-returns/:id        → File/update return
POST /api/gst-returns/validate-gstin → GSTIN validator
POST /api/gst-returns/hsn-lookup  → HSN/SAC rate finder
POST /api/gst-returns/itc-calc    → ITC reconciliation
POST /api/gst-returns/late-fee    → Late fee calculator
```

### CA Practice Management (Phase 3)
```
POST /api/practice/clients        → Add client
GET  /api/practice/clients        → Client CRM list
PATCH /api/practice/clients/:id   → Update client
POST /api/practice/staff          → Add staff
POST /api/practice/tasks          → Create task
GET  /api/practice/tasks          → Task list (auto-marks overdue)
POST /api/practice/billing        → Generate invoice
GET  /api/practice/franchise/dashboard → Multi-branch dashboard
POST /api/practice/notifications/send → Send WhatsApp/SMS/Email
```

### Accounting (Phase 3)
```
POST /api/accounting/ledger       → Post double-entry
GET  /api/accounting/ledger       → Ledger query
GET  /api/accounting/trial-balance → Trial Balance
GET  /api/accounting/pl           → P&L Statement
GET  /api/accounting/balance-sheet → Balance Sheet
POST /api/accounting/bank-reconciliation → BRS
POST /api/accounting/payroll/process → Payroll run
GET  /api/accounting/fixed-assets → WDV/SLM register
GET  /api/accounting/reports/financial-ratios → Ratios
POST /api/accounting/year-closing → Year-end entries
```

### Compliance Calendar (Phase 3)
```
GET  /api/compliance/calendar     → Full IT/GST/TDS/ROC calendar
GET  /api/compliance/upcoming     → Next N days deadlines
POST /api/compliance/reminder     → Schedule AI reminder
POST /api/compliance/penalty-calc → 234A/B/C calculator
POST /api/compliance/interest-calc → GST Section 50 interest
GET  /api/compliance/health-score → Compliance score (0-100)
GET  /api/compliance/roc-calendar → ROC/Companies Act dates
```

### AI Engine (Phase 2 — Port 3002)
```
GET  /ai/health                   → Status check
POST /ai/chat                     → Hindi/English tax Q&A (Gemini 2.5 Flash)
POST /ai/ocr                      → Document extraction (Tesseract + Vision)
POST /ai/voice/transcribe         → Speech-to-text
POST /ai/notice/analyze           → IT/GST notice decoder
POST /ai/tax-plan                 → Personalized tax saving plan
POST /ai/regime-compare           → Old vs New regime comparison
```

---

## Validation Rules (Phase 1 Skeleton → 1000+ Target)

| Category | Current Rules | Target |
|----------|--------------|--------|
| Personal | 10 | 60 |
| Income | 15 | 200 |
| Deductions | 15 | 150 |
| GST | 10 | 200 |
| Banking | 5 | 50 |
| Filing | 12 | 250 |
| **Total** | **67** | **910+** |

---

## Database Schema (Phase 1)

Models: `User` · `Branch` · `Client` · `StaffProfile` · `TaxFile` · `GSTReturn` · `ValidationRun` · `AuditLog` · `Task` · `Invoice` · `Notification`

Enums: `UserRole` (6) · `FilingStatus` (15) · `TaxRegime` · `ITRFormType` (7) · `GSTReturnType` (7) · `TaskStatus` (6) · `TaskPriority` (4) · `InvoiceStatus` (6) · `NotificationChannel` (5)

---

## Key Technical Decisions

1. **Phase 1: In-memory store** → Phase 4: Prisma + PostgreSQL (schema already defined)
2. **Validation Engine: JavaScript skeleton** → Phase 4: JSON Schema / Drools / Custom rule engine
3. **AI: Gemini 2.5 Flash** (gemini-1.5/2.0 deprecated June 2026)
4. **No hardcoded API keys** → localStorage + GitHub Secrets via CI/CD
5. **Double-entry accounting** → Phase 4: Bank feed integration
6. **White Label ready** → Branch model supports multiple tenants

---

## Phase 4 Gap (Honest Assessment)

- Real GSTN / IT Portal API keys (planned, not connected)
- Production deployment (AWS/Vercel/Cloudflare — CI pipeline ready)
- Multi-tenant DB isolation (schema ready, middleware needed)
- Full 1000+ server-side rules (skeleton only)
- Next.js frontend (planned — current: static HTML, GitHub Pages)
- 150 modules fully coded (20+ skeleton; rest planned)

---

## Quick Start (3 Terminals)

```bash
# Terminal 1 — Database
cd database && docker-compose up -d

# Terminal 2 — Backend (Port 3001)
cd backend
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run start:dev

# Terminal 3 — AI Engine (Port 3002)
cd ai
npm install
GEMINI_API_KEY="AIzaSy..." npm run dev
```

**Swagger UI:** http://localhost:3001/api/docs  
**API:** http://localhost:3001/api  
**AI:** http://localhost:3002/ai/health  

---

*TaxMitra AI Enterprise — Developer: Abhishek Agrahari | Kanpur, UP*
