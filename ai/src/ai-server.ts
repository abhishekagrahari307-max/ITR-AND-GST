/**
 * TaxMitra Enterprise — AI Engine Server (Phase 2)
 * Developer: Abhishek Agrahari | Kanpur, UP
 *
 * Port: 3002
 * Endpoints:
 *   POST /ai/chat            → Hindi/English Tax Q&A (Gemini 2.5 Flash)
 *   POST /ai/ocr             → Document extraction (Tesseract + Gemini Vision)
 *   POST /ai/voice/transcribe → Speech-to-text
 *   POST /ai/notice/analyze  → IT/GST Notice decoder
 *   POST /ai/tax-plan        → Personalized tax saving plan
 *   POST /ai/regime-compare  → Old vs New regime advisor
 *   GET  /ai/health          → Service status
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { GeminiTaxAssistant } from './gemini-client';
import { AIOcrService } from './ocr-service';
import { AIVoiceService } from './voice-service';
import { NoticeAnalyzer } from './notice-analyzer';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: ['https://abhishekagrahari307-max.github.io', 'http://localhost:3000', 'http://localhost:3001'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Services
const gemini = new GeminiTaxAssistant(process.env.GEMINI_API_KEY);
const ocr = new AIOcrService();
const voice = new AIVoiceService();
const analyzer = new NoticeAnalyzer(process.env.GEMINI_API_KEY);

// ── Routes ────────────────────────────────────────────────

/**
 * Health check
 */
app.get('/ai/health', (req, res) => {
  res.json({
    status: 'Phase 2 AI Engine Active',
    gemini: !!process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-flash',
    developer: 'Abhishek Agrahari',
    version: '2.0.0-phase2',
    endpoints: ['/ai/chat', '/ai/ocr', '/ai/voice/transcribe', '/ai/notice/analyze', '/ai/tax-plan', '/ai/regime-compare'],
  });
});

/**
 * Hindi/English Tax Q&A
 * POST /ai/chat
 * Body: { message: string, context?: any, language?: 'hi'|'en' }
 */
app.post('/ai/chat', async (req, res) => {
  try {
    const { message, context, language = 'hi' } = req.body;
    if (!message) return res.status(400).json({ error: 'message field required' });

    const result = await gemini.askTaxQuestion(message, context, language);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: 'AI service error', details: e.message, fallback: 'Rule-based response available via /ai/chat/rule-based' });
  }
});

/**
 * Document OCR
 * POST /ai/ocr
 * Body: { filePath?: string, base64?: string, docType: 'pan'|'aadhaar'|'form16'|'bank'|'invoice' }
 */
app.post('/ai/ocr', async (req, res) => {
  try {
    const { filePath, base64, docType = 'form16' } = req.body;
    const result = await ocr.extractFromImage(filePath || '', docType, base64);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: 'OCR failed', details: e.message });
  }
});

/**
 * Voice transcription
 * POST /ai/voice/transcribe
 * Body: { audioBase64?: string, language?: string }
 */
app.post('/ai/voice/transcribe', async (req, res) => {
  try {
    const { audioBase64, language = 'hi-IN' } = req.body;
    const result = await voice.transcribeAudio(undefined, undefined);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: 'Voice service error', details: e.message });
  }
});

/**
 * Notice analyzer
 * POST /ai/notice/analyze
 * Body: { text: string, profile?: any }
 */
app.post('/ai/notice/analyze', async (req, res) => {
  try {
    const { text, profile } = req.body;
    if (!text) return res.status(400).json({ error: 'Notice text required' });

    const result = await analyzer.analyze(text, profile);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: 'Notice analysis failed', details: e.message });
  }
});

/**
 * Tax saving plan
 * POST /ai/tax-plan
 * Body: { income: number, age: number, deductions?: any, goals?: string[] }
 */
app.post('/ai/tax-plan', async (req, res) => {
  try {
    const { income, age = 30, deductions = {}, goals = [] } = req.body;
    const result = await gemini.getTaxPlan({ income, age, ...deductions }, deductions);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: 'Tax planning failed', details: e.message });
  }
});

/**
 * Regime comparison
 * POST /ai/regime-compare
 * Body: { income: number, deductions: number, age?: number }
 */
app.post('/ai/regime-compare', async (req, res) => {
  try {
    const { income = 1200000, deductions = 150000, age = 30 } = req.body;

    // Quick computation (mirrors tax-engine/itr-validator.ts)
    const compute = (incm: number, ded: number, regime: 'NEW' | 'OLD') => {
      const stdDed = regime === 'NEW' ? 75000 : 50000;
      const netIncome = Math.max(0, incm - stdDed - (regime === 'OLD' ? ded : 0));

      const newSlabs = [[0,400000,0],[400000,800000,5],[800000,1200000,10],[1200000,1600000,15],[1600000,2000000,20],[2000000,2400000,25],[2400000,Infinity,30]];
      const oldSlabs = [[0,250000,0],[250000,500000,5],[500000,1000000,20],[1000000,Infinity,30]];
      const slabs = regime === 'NEW' ? newSlabs : oldSlabs;

      let tax = 0;
      for (const [from, to, rate] of slabs) {
        if (netIncome <= from) break;
        tax += (Math.min(netIncome, to) - from) * rate / 100;
      }
      tax = Math.round(tax);

      const rebate = regime === 'NEW' && netIncome <= 1200000 ? Math.min(tax, 60000) : regime === 'OLD' && netIncome <= 500000 ? Math.min(tax, 12500) : 0;
      const afterRebate = Math.max(0, tax - rebate);
      const cess = Math.round(afterRebate * 0.04);
      return { netIncome, tax, rebate, totalTax: afterRebate + cess };
    };

    const newResult = compute(income, deductions, 'NEW');
    const oldResult = compute(income, deductions, 'OLD');
    const better = newResult.totalTax <= oldResult.totalTax ? 'NEW' : 'OLD';
    const saving = Math.abs(newResult.totalTax - oldResult.totalTax);

    res.json({
      income, deductions, age,
      newRegime: { ...newResult, regime: 'NEW', standardDeduction: 75000 },
      oldRegime: { ...oldResult, regime: 'OLD', standardDeduction: 50000 },
      betterRegime: better,
      saving,
      recommendation: better === 'NEW'
        ? `✅ New Regime better by ₹${saving.toLocaleString('en-IN')}. Deductions ≤ ₹${deductions.toLocaleString('en-IN')} don't compensate for lower New Regime slabs.`
        : `✅ Old Regime better by ₹${saving.toLocaleString('en-IN')} due to ₹${deductions.toLocaleString('en-IN')} in deductions.`,
      zeroTax: newResult.totalTax === 0 && income <= 1275000,
      developer: 'Abhishek Agrahari — TaxMitra AI Enterprise',
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Regime comparison failed', details: e.message });
  }
});

// ── Start Server ──────────────────────────────────────────
const PORT = process.env.AI_PORT || 3002;
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  TaxMitra AI Engine — Phase 2 Active         ║`);
  console.log(`║  Developer: Abhishek Agrahari | Kanpur, UP   ║`);
  console.log(`╠══════════════════════════════════════════════╣`);
  console.log(`║  Port: ${PORT}   Model: gemini-2.5-flash         ║`);
  console.log(`║  Gemini: ${process.env.GEMINI_API_KEY ? '✅ Active' : '⚠️  No key (mock mode)'}               ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
});
