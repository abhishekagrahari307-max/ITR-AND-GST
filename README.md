# ⚡ TaxMitra AI Enterprise

> **India's Most Advanced All-in-One Tax Platform** – Computax, ClearTax se bhi zyada feature-rich!

[![Live Demo](https://img.shields.io/badge/Demo-Live-brightgreen)](https://taxmitra.ai)
[![Platform](https://img.shields.io/badge/Platform-Web%20PWA-blue)]()
[![AI Powered](https://img.shields.io/badge/AI-Powered-purple)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

---

## 🚀 What is TaxMitra AI Enterprise?

TaxMitra AI Enterprise is a **complete taxation ecosystem** combining:
- Computax-style professional tax computation engine
- AI-powered tax assistance (Hindi + English)
- ITR filing center (ITR-1 to ITR-7)
- GST Professional Suite
- TDS & Payroll Management
- Business Accounting
- Investment Planning
- Compliance Hub
- 50+ Professional Calculators

**All in one platform. 100% Free. AI-powered.**

---

## 📁 Project Structure

```
ITR-AND-GST/
├── index.html              # Main homepage (complete platform overview)
├── login.html              # Login page
├── signup.html             # Registration page
├── manifest.json           # PWA manifest
├── css/
│   ├── style.css           # Original styles
│   └── taxmitra.css        # TaxMitra Enterprise master stylesheet
├── js/
│   ├── taxmitra.js         # Master JavaScript (AI, search, calculators)
│   ├── main.js             # Original JS
│   └── assistant.js        # AI assistant JS
└── pages/
    ├── ai-assistant.html   # Full AI Tax Assistant
    ├── itr-center.html     # Complete ITR Filing Center
    ├── gst.html            # GST Professional Suite
    ├── calculators.html    # 50+ Tax Calculators
    ├── dashboard.html      # User Dashboard
    ├── tds-payroll.html    # TDS & Payroll Management
    ├── compliance.html     # Compliance Hub & Calendar
    ├── investment.html     # AI Investment Planner
    ├── accounting.html     # Business & Accounting Suite
    ├── documents.html      # AI Document Center (OCR)
    ├── knowledge.html      # Knowledge Center
    └── reports.html        # Reports & Analytics
```

---

## 🎯 14 Feature Modules

| # | Module | Key Features |
|---|--------|-------------|
| 1 | 🤖 AI Tax Assistant | Hindi+English chat, Voice, Document Q&A, Notice Explainer |
| 2 | 🧮 Tax Computation | Individual, HUF, Firm, LLP, Company – Computax style |
| 3 | 🔢 Calculators | 50+ tools – Income Tax, HRA, SIP, EMI, PPF, Capital Gain |
| 4 | 📋 ITR Center | ITR-1 to ITR-7, AI form selector, AIS, Form 16 analysis |
| 5 | 🧾 GST Suite | GSTR-1/3B/9, Invoice, E-Invoice, ITC Calculator, HSN Search |
| 6 | 💼 TDS & Payroll | Salary TDS, Form 16, Payslip Generator, 24Q/26Q/27Q |
| 7 | 📒 Accounting | Ledger, P&L, Balance Sheet, Invoice, Expense, BRS |
| 8 | 📅 Compliance Hub | IT/GST/TDS due dates, AI reminders, Penalty calculator |
| 9 | 📁 Document Center | AI OCR, PAN/Aadhaar/Form 16/26AS upload, auto-summary |
| 10 | 📈 Investment Planner | 80C planner, Goal planning, NPS/PPF/ELSS comparison |
| 11 | 📚 Knowledge Center | Tax laws, Budget 2025, CBDT circulars, FAQs |
| 12 | 📊 Reports | Tax computation, Financial health score, PDF/Excel export |
| 13 | 🏠 Dashboard | Filing status, AI recommendations, activity history |
| 14 | ⚙️ Admin Panel | User management, analytics, audit logs |

---

## 🤖 AI Features

- **AI Tax Chat** – Hindi + English tax Q&A
- **Voice Assistant** – Speech recognition input
- **Document OCR** – PDF/Image reading with data extraction
- **ITR Form Recommender** – Auto-selects right form
- **Notice Explainer** – Decodes IT notices in simple language
- **Tax Saving Advisor** – Personalized deduction suggestions
- **Old vs New Regime Advisor** – AI-powered regime comparison
- **Investment Advisor** – Goal-based financial planning

---

## 🔢 Tax Calculators (50+)

**Income Tax:** Income Tax, Old/New Regime, Advance Tax, Capital Gain, AMT/MAT, Surcharge, Interest 234A/B/C, Rebate 87A

**GST:** GST Calculator, Reverse GST, ITC Calculator, Interest & Penalty

**Salary:** HRA, Gratuity, Leave Encashment, EPF, TDS on Salary, Salary Breakup

**Investment:** SIP, PPF, NPS, FD, RD, SWP, CAGR, Mutual Fund

**Loans:** EMI, Home Loan Tax, Education Loan, Car Loan, Personal Loan

---

## 🛠️ Technology Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | HTML5, CSS3 (Custom Framework), Vanilla JavaScript |
| Animations | CSS Keyframes, Intersection Observer API |
| AI | Rule-based NLP, Speech Recognition API, Browser APIs |
| PWA | Service Workers, Web Manifest, Offline Support |
| Storage | LocalStorage, IndexedDB (planned) |
| Charts | CSS-based charts (Chart.js planned) |

### Production Stack (Planned)
- **Frontend:** Next.js + TypeScript + Tailwind CSS + Framer Motion
- **Backend:** NestJS + Node.js + REST + GraphQL
- **Database:** PostgreSQL + Redis + Prisma ORM
- **AI:** OpenAI GPT + Custom OCR Engine + NLP
- **Cloud:** Vercel + AWS + Cloudflare CDN
- **Security:** JWT + 2FA + AES-256 + SSL

---

## 🚀 Getting Started

```bash
# Clone the repository
git clone https://github.com/abhishekagrahari307-max/ITR-AND-GST.git

# Open in browser (no server needed for basic features)
open index.html

# Or serve locally
npx serve .
# Then visit http://localhost:3000
```

---

## 🎨 Features

- ✅ Dark/Light Mode with localStorage persistence
- ✅ Mobile Responsive (320px to 4K)
- ✅ Progressive Web App (PWA) installable
- ✅ Keyboard shortcuts (Ctrl+K for search)
- ✅ Global search with instant results
- ✅ Floating AI Assistant on every page
- ✅ Toast notifications
- ✅ Smooth animations (Intersection Observer)
- ✅ Counter animations
- ✅ Multi-language AI (Hindi, English, Marathi)
- ✅ Voice input support
- ✅ Print-friendly invoices and payslips

---

## 📱 Pages

| Page | Description |
|------|------------|
| `/index.html` | Homepage with all 14 modules, AI showcase, calculators preview |
| `/login.html` | Professional login with Google, Aadhaar OTP options |
| `/pages/ai-assistant.html` | Full-screen AI tax chat with modes |
| `/pages/itr-center.html` | Complete ITR filing with AI form recommender |
| `/pages/gst.html` | GST suite – returns, invoice, ITC, HSN search |
| `/pages/calculators.html` | 50+ calculators with sidebar navigation |
| `/pages/dashboard.html` | Personal tax dashboard |
| `/pages/tds-payroll.html` | TDS calculator, payslip generator, Form 16 |
| `/pages/compliance.html` | Compliance calendar, AI reminders, penalty calc |
| `/pages/investment.html` | Investment planner, 80C tracker, goal planning |
| `/pages/accounting.html` | Invoice, expense tracker, P&L, ledger, BRS |
| `/pages/documents.html` | AI OCR document upload and analysis |
| `/pages/knowledge.html` | Tax library, Budget 2025, CBDT circulars, FAQs |
| `/pages/reports.html` | Financial health score, tax reports, PDF export |

---

## 👨‍💻 Developer

**Abhishek Agrahari**
- Email: abhishekagrahari312@gmail.com
- GitHub: [@abhishekagrahari307-max](https://github.com/abhishekagrahari307-max)

---

## 📜 License

MIT License – Free to use, modify and distribute.

---

> ⚠️ **Disclaimer:** TaxMitra AI is for educational and informational purposes. Always consult a qualified Chartered Accountant for final tax decisions.

---

*Built with ❤️ for Indian taxpayers, CAs, and businesses*
