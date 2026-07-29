# 🚀 TaxMitra AI Enterprise – Backend Setup Guide

## Architecture Overview

```
Frontend (HTML/CSS/JS) ──► API Client (js/api.js) ──► NestJS Backend ──► PostgreSQL + Redis
                                                            │
                                                    Firebase Auth
                                                    Gemini / OpenAI
                                                    Tesseract OCR
```

---

## 📋 Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | v20+ | https://nodejs.org |
| PostgreSQL | v15+ | https://postgresql.org |
| Redis | v7+ | https://redis.io |
| Docker | Latest | https://docker.com |

---

## ⚡ Quick Start (with Docker – Recommended)

```bash
# 1. Go to backend directory
cd backend

# 2. Copy environment file
cp .env.example .env
# Edit .env with your API keys

# 3. Start database + Redis with Docker
docker-compose up postgres redis -d

# 4. Install Node packages
npm install

# 5. Generate Prisma client + run migrations
npx prisma generate
npx prisma migrate dev --name init

# 6. (Optional) Seed demo data
npx ts-node prisma/seed.ts

# 7. Start backend in dev mode
npm run start:dev
```

**Backend runs at:** `http://localhost:3001`  
**Swagger API Docs:** `http://localhost:3001/api/docs`

---

## 🔑 Getting API Keys

### 1. Firebase Setup (Authentication)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create project → "TaxMitra"
3. **Authentication** → Enable: Email/Password, Google, Phone
4. **Project Settings** → Service Accounts → Generate new private key
5. Copy values to `.env`:
   ```
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...
   ```

### 2. Gemini AI (Free Tier – Recommended)

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create API Key (FREE – 15 requests/minute)
3. Add to `.env`: `GEMINI_API_KEY=AIzaSy...`

### 3. OpenAI (Optional – Paid)

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create API Key
3. Add to `.env`: `OPENAI_API_KEY=sk-...`

### 4. Database Setup

```bash
# Create PostgreSQL database
psql -U postgres -c "CREATE USER taxmitra WITH PASSWORD 'password';"
psql -U postgres -c "CREATE DATABASE taxmitra_db OWNER taxmitra;"
```

Update `.env`:
```
DATABASE_URL="postgresql://taxmitra:password@localhost:5432/taxmitra_db"
```

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register with email+password |
| POST | `/auth/login` | Login with email/PAN/mobile |
| POST | `/auth/firebase-login` | Login with Firebase token (Google/OTP) |
| POST | `/auth/refresh` | Refresh access token |
| GET  | `/auth/me` | Get current user |
| DELETE | `/auth/logout` | Logout |

### Tax Calculations (Computax-style)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/calculations/compute` | Full income tax computation + save |
| POST | `/calculations/compare-regime` | Old vs New Regime comparison |
| POST | `/calculations/hra` | HRA exemption calculator |
| POST | `/calculations/sip` | SIP calculator |
| POST | `/calculations/emi` | EMI calculator |
| POST | `/calculations/capital-gain` | Capital gain tax |
| POST | `/calculations/gst` | GST calculator |
| GET  | `/calculations` | Get all saved calculations |

### AI Assistant
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ai/chat` | Chat with AI (Gemini + OpenAI + Rule-based) |
| POST | `/ai/tax-plan` | Get personalised tax plan |
| POST | `/ai/recommend-form` | AI recommends ITR form |
| POST | `/ai/explain-notice` | AI explains IT notice |
| GET  | `/ai/chat-history` | Get chat history |

### Documents (OCR)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/documents/upload` | Upload + AI OCR process |
| GET  | `/documents` | Get all documents |
| DELETE | `/documents/:id` | Delete document |

### Compliance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/compliance/dates` | Get all due dates |
| GET  | `/compliance/tasks` | Get user tasks |
| POST | `/compliance/tasks` | Create task |
| POST | `/compliance/reminders` | Set AI reminders |
| POST | `/compliance/penalty` | Calculate penalty |

---

## 🌐 Connect Frontend to Backend

In `js/api.js` (or each page), set your backend URL:

```javascript
window.TAXMITRA_API_URL = 'http://localhost:3001/api/v1'; // Development
// window.TAXMITRA_API_URL = 'https://api.taxmitra.ai/api/v1'; // Production
```

The `js/api.js` file handles:
- ✅ JWT token management (auto-refresh)
- ✅ Firebase authentication flow
- ✅ All API endpoints as clean functions
- ✅ Error handling with fallbacks

---

## 🚀 Production Deployment

### Option 1: Full Docker Deploy
```bash
docker-compose up -d    # Starts Postgres + Redis + API
docker-compose logs -f  # View logs
```

### Option 2: Vercel (Frontend) + Railway/Render (Backend)

**Frontend (Vercel):**
```bash
vercel deploy  # Deploys from root directory
```

**Backend (Railway.app):**
1. Connect GitHub repo
2. Set root directory to `backend`
3. Add environment variables
4. Auto-deploys on push!

**Backend (Render.com):**
1. New Web Service → Connect GitHub
2. Root Dir: `backend`
3. Build: `npm install && npm run build`
4. Start: `node dist/main`

### Option 3: AWS EC2 + RDS + ElastiCache
Full production setup with:
- RDS PostgreSQL
- ElastiCache Redis  
- EC2 for NestJS
- S3 for document storage

---

## 🔒 Security Checklist

- [ ] Change JWT_SECRET to random 64+ char string
- [ ] Enable 2FA for admin accounts
- [ ] Configure CORS for your domain only
- [ ] Enable HTTPS / SSL
- [ ] Set NODE_ENV=production
- [ ] Enable Prisma connection pooling
- [ ] Configure Redis with password
- [ ] Enable rate limiting (already configured: 100 req/min)
- [ ] Regular database backups
- [ ] Enable audit logging

---

## 📊 Database Schema

Key tables (see `prisma/schema.prisma` for full schema):

- `users` – User profiles with Firebase UID
- `tax_calculations` – Saved tax computations
- `itr_filings` – ITR filing records
- `gst_returns` – GST return history
- `documents` – Uploaded documents with OCR data
- `ai_chats` + `ai_messages` – Chat history
- `compliance_tasks` – Compliance tracking
- `notifications` – User notifications
- `audit_logs` – Full audit trail
- `sessions` – JWT session tracking

---

## 🛠️ Development Commands

```bash
npm run start:dev          # Start with hot reload
npm run prisma:studio      # Open Prisma Studio (DB GUI)
npm run prisma:migrate     # Run new migrations
npm run build              # Build for production
npm run test               # Run unit tests
npm run test:e2e           # Run E2E tests
docker-compose up -d       # Start all services
```

---

Built by **Abhishek Agrahari** | abhishekagrahari312@gmail.com
