# TaxMitra AI Enterprise 🚀

**India's Most Advanced Free Tax Platform — AY 2026-27 (Budget 2025 Updated)**

**Developer:** Abhishek Agrahari | Lucknow, UP  
**Live URL:** https://abhishekagrahari307-max.github.io/ITR-AND-GST/

---

## 🏆 Platform Overview

TaxMitra AI Enterprise is a complete 45-page tax platform with real Gemini AI, PDF generation, XLSX export, and 150+ modules.

### ✅ Key Features
- **Real Gemini 2.5 Flash AI** — Hindi+English, tax advice, OCR, notice analysis
- **Budget 2025 Ready** — New regime slabs, ₹12.75L = ZERO TAX
- **38+ pages** — ITR, GST, TDS, Calculators, Payroll, CRM, and more
- **Mobile Responsive** — 320px to 1536px
- **PWA** — Install as app, works offline
- **6 Languages** — हिंदी, English, தமிழ், తెలుగు, বাংলা, मराठी
- **Dark Mode** — Full dark theme support

### 📋 All Modules (45 pages)

#### Phase 1 — Core (24 pages)
- ITR Filing Center (ITR-1 to ITR-7)
- Tax Computation Sheet V2 (Computax style)
- 50+ Tax Calculators
- GST Professional Suite (GSTR-1/3B/9)
- TDS & Payroll
- AI Assistant (Gemini 2.5 Flash)
- Document Center (OCR)
- Import Center (9 methods)
- Investment Planner
- Compliance Hub
- Reports & Analytics
- User Dashboard
- Rent Receipt Generator
- Knowledge Center
- Budget 2025 Guide
- Setup, About, Contact, Legal pages

#### Phase 2+3 — Enterprise (9 pages)
- GSTR-9 Annual Return
- E-Way Bill Generator
- GST Reconciliation
- Foreign Income & DTAA
- TDS Returns (24Q/26Q/27Q)
- Payroll Management
- Client CRM
- Challan Management
- AI Deduction Finder

#### Phase 1 Extras (6 pages)
- F&O Trading Tax
- Crypto Tax Calculator
- Capital Gains Advanced
- Notices Manager
- Refund Tracker
- AI Notice Analyzer

#### Phase 4 — Advanced (7 pages) ✨ NEW
- 🏦 Bank Statement Parser (AI categorize + 26AS reconcile)
- 🏗️ Fixed Assets & Depreciation (WDV/SLM, IT Act Sec 32)
- 💰 GST Refund Module (RFD-01, Export, Inverted Duty)
- ⚖️ Appeals & Rectification (Sec 154, CIT(A), ITAT, Faceless)
- 🪪 PAN Services Center (Verify, Aadhaar Link, e-PAN, New PAN)
- 🎯 AI Tax Risk Score (Scrutiny probability, AIS mismatch)
- 🔐 Document Vault (Secure local storage, organize, expiry alerts)

---

## 🔑 AI Setup

Visit **[Setup Page](https://abhishekagrahari307-max.github.io/ITR-AND-GST/pages/setup.html)** to enter your Gemini API key.

Or run in browser console:
```js
TaxMitra.setKeys({
  geminiApiKey: 'AIzaSy...',      // From aistudio.google.com
  openrouterApiKey: 'sk-or-...'  // Optional fallback
})
```

Get free Gemini key: https://aistudio.google.com/app/apikey

---

## 🛠️ Tech Stack
- **Frontend:** Vanilla HTML/CSS/JS (no framework needed — pure speed)
- **AI:** Gemini 2.5 Flash (primary) + OpenRouter Llama fallback
- **PDF:** jsPDF + jspdf-autotable
- **Charts:** Chart.js
- **Auth:** Firebase (optional)
- **PWA:** Service Worker v4

---

## ⚙️ CI/CD Setup

1. GitHub Secrets: `GEMINI_API_KEY`, `OPENROUTER_API_KEY`
2. Copy `WORKFLOW_TO_CREATE.yml` → `.github/workflows/deploy.yml` on GitHub UI
3. Settings → Pages → Source → GitHub Actions

---

*TaxMitra AI Enterprise — Built with ❤️ by Abhishek Agrahari*
