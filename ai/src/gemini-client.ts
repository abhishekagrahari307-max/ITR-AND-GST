/**
 * TaxMitra Enterprise — Gemini AI Client (Phase 2)
 * Developer: Abhishek Agrahari | Kanpur, UP
 *
 * Model: gemini-2.5-flash (v1beta — July 2026)
 * Features: Hindi+English Q&A, Notice Explanation, Tax Plan, Regime Advisor
 * Fallback: Rule-based responses (no API key required)
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

export interface AIResponse {
  answer: string;
  source: 'gemini-2.5-flash' | 'rule-based-fallback' | 'openrouter';
  confidence: number;
  language: 'hi' | 'en' | 'auto';
  model?: string;
}

// ── Rule-based fallback (works without API key) ──────────
const RULE_BASED_RESPONSES: Record<string, string> = {
  '80c': '80C deduction limit: ₹1,50,000 per year. Eligible investments: PPF, EPF, ELSS, LIC premium, NSC, tax-saving FD (5yr), tuition fees, home loan principal. NOTE: 80C नहीं मिलती New Regime में।',
  '80d': '80D Health Insurance premium deduction: Self/family ₹25,000, Senior citizen parents ₹50,000. Total max: ₹75,000 (both senior). New Regime में नहीं मिलती।',
  'hra': 'HRA exemption = Minimum of: (1) Actual HRA received, (2) 50% salary (metro) / 40% (non-metro), (3) Rent paid minus 10% salary. Landlord PAN mandatory if rent > ₹1L/year.',
  'new regime': 'New Regime (Budget 2025): 0-4L: Nil | 4-8L: 5% | 8-12L: 10% | 12-16L: 15% | 16-20L: 20% | 20-24L: 25% | >24L: 30%. Standard Deduction ₹75,000. ₹12.75L = ZERO TAX!',
  'old regime': 'Old Regime: 0-2.5L: Nil | 2.5-5L: 5% | 5-10L: 20% | >10L: 30%. Standard Deduction ₹50,000. 80C/80D/HRA deductions available.',
  '87a': '87A Rebate: New Regime → Net income ≤ ₹12L: ₹60,000 rebate (zero tax). Old Regime → Income ≤ ₹5L: ₹12,500 rebate.',
  'gst': 'GST rates: 0% (food/books) | 5% (essential goods) | 12% (medicines/processed food) | 18% (IT services/electronics) | 28% (luxury/sin goods + cess). GSTIN format: 15 chars.',
  'tds': 'TDS rates: Salary (as per slab) | Bank FD 10% (194A) | Rent >₹50K/month 10% (194I) | Professional fees 10% (194J) | Crypto 1% (194S). Deposit by 7th of next month.',
  'itr': 'ITR forms: ITR-1 (salaried, income <₹50L) | ITR-2 (capital gains, foreign) | ITR-3 (business/F&O) | ITR-4 (presumptive) | ITR-5 (LLP/firm) | ITR-6 (company) | ITR-7 (trust).',
  'capital gains': 'Capital Gains: LTCG equity >₹1.25L: 12.5% (Budget 2024) | STCG equity: 20% (post July 23, 2024) | LTCG property: 12.5% without indexation (Budget 2024) | STCG property: slab rate.',
  'crypto': 'Crypto/VDA tax: 30% flat tax + 4% cess + 1% TDS on seller (Sec 194S). No deduction except cost of acquisition. Cannot set off crypto loss against other income.',
  'advance tax': 'Advance Tax: Tax liability >₹10,000: Q1 15% by June 15, Q2 45% by Sep 15, Q3 75% by Dec 15, Q4 100% by Mar 15. Delay: 1% interest per month (Sec 234C).',
  'nps': 'NPS: 80CCD(1) within 80C ₹1.5L limit. Extra 80CCD(1B) ₹50,000 over 80C. Employer contribution 80CCD(2) still allowed in New Regime. Tax-free on maturity (60% lump sum).',
  'ppf': 'PPF: 15-year lock-in, 7.1% interest (2026), ₹1.5L max per year, EEE status (exempt-exempt-exempt), no TDS, safe government scheme. Partial withdrawal from 7th year.',
  'deadline': 'Tax deadlines AY 2026-27: ITR July 31, 2026 | Audit cases Oct 31, 2026 | Advance Tax Q4 March 15, 2026 | GSTR-3B 20th of each month | TDS return 30 days after quarter end.',
};

function getRuleBasedResponse(query: string): string {
  const q = query.toLowerCase();
  for (const [key, response] of Object.entries(RULE_BASED_RESPONSES)) {
    if (q.includes(key)) return response;
  }
  return `TaxMitra Tax Assistant: "${query}" — Aapke sawaal ke liye Gemini API key set karein ya setup.html visit karein. Rule-based response: Income Tax Act AY 2026-27 mein specific guidance ke liye CA se consult karein.`;
}

export class GeminiTaxAssistant {
  private genAI: GoogleGenerativeAI | null = null;
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    if (this.apiKey && this.apiKey.startsWith('AIzaSy')) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
    } else {
      console.log('ℹ️  Gemini API key not found — using rule-based fallback mode');
    }
  }

  async askTaxQuestion(prompt: string, context?: any, language: 'hi' | 'en' | 'auto' = 'auto'): Promise<AIResponse> {
    // Rule-based fallback (no API key needed)
    if (!this.genAI || !this.apiKey.startsWith('AIzaSy')) {
      return {
        answer: getRuleBasedResponse(prompt),
        source: 'rule-based-fallback',
        confidence: 0.70,
        language: 'hi',
      };
    }

    const langInstruction = language === 'hi'
      ? 'Respond in Hindi (Devanagari script) with key terms in English where needed.'
      : language === 'en'
      ? 'Respond in clear English.'
      : 'Detect the language of the question and respond in the same language (Hindi/English mix is fine).';

    const systemPrompt = `You are TaxMitra AI — India's expert tax assistant for AY 2026-27.
${langInstruction}

CONTEXT: Budget 2025 | AY 2026-27 | FY 2025-26 | New Regime ₹12.75L = ZERO TAX
User profile: ${JSON.stringify(context || {})}

RULES:
1. Be accurate — cite section numbers (Sec 80C, 87A, 111A etc.)
2. Mention if deduction is NOT available in New Regime
3. Always add disclaimer for complex cases: "CA se confirm zaroor karein"
4. For tax calculations: show step-by-step
5. Format nicely with bullet points / numbered lists
6. Be conversational, not robotic`;

    try {
      const model = this.genAI.getGenerativeModel(
        { model: 'gemini-2.5-flash' },
        {
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          ],
        },
      );

      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\nQuestion: ' + prompt }] },
        ],
        generationConfig: {
          temperature: 0.3,     // Low temperature for accurate tax info
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
      });

      const text = result.response.text();
      return {
        answer: text,
        source: 'gemini-2.5-flash',
        confidence: 0.92,
        language: language === 'auto' ? 'auto' : language,
        model: 'gemini-2.5-flash',
      };
    } catch (e: any) {
      console.error('Gemini API error:', e.message);
      return {
        answer: getRuleBasedResponse(prompt) + '\n\n(Note: AI temporarily unavailable — rule-based response)',
        source: 'rule-based-fallback',
        confidence: 0.65,
        language: 'hi',
      };
    }
  }

  async explainNotice(noticeText: string): Promise<{ explanation: string; actions: string[]; urgency: 'low' | 'medium' | 'high'; deadline?: string }> {
    if (!this.genAI) {
      return {
        explanation: `Notice Analysis (Rule-based): This appears to be an Income Tax / GST notice. Key action: Respond within time limit given.`,
        actions: ['Read notice carefully', 'Check demand amount', 'Consult CA immediately', 'File response before deadline', 'Upload supporting documents on IT Portal'],
        urgency: 'high',
        deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      };
    }

    const prompt = `You are a tax notice expert. Analyze this notice and provide:
1. Simple explanation in Hindi/English
2. Required actions (numbered list)
3. Urgency level (low/medium/high)
4. Estimated deadline if mentioned

Notice: ${noticeText.slice(0, 2000)}`;

    const response = await this.askTaxQuestion(prompt);

    return {
      explanation: response.answer,
      actions: [
        'Notice ध्यान से पढ़ें',
        'Demand amount verify करें AIS/26AS से',
        'CA से तुरंत consult करें',
        'IT Portal पर response upload करें',
        'Deadline से पहले जवाब दें',
      ],
      urgency: 'high',
      deadline: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    };
  }

  async getTaxPlan(incomeDetails: any, deductions?: any): Promise<{ recommendations: string[]; estimatedSaving: number; regimeAdvice: 'OLD' | 'NEW'; aiAnalysis: string }> {
    const income = incomeDetails.income || incomeDetails.grossSalary || 0;
    const currentDeductions = deductions?.total || 0;

    // Rule-based tax saving recommendations
    const recommendations: string[] = [];
    let potentialSaving = 0;

    if (income > 400000) {
      const gap80C = Math.max(0, 150000 - (deductions?.u80C || 0));
      if (gap80C > 0) { recommendations.push(`Invest ₹${gap80C.toLocaleString('en-IN')} more in 80C (PPF/ELSS/LIC) → Save up to ₹${(gap80C * 0.30).toLocaleString('en-IN')}`); potentialSaving += gap80C * 0.20; }
    }

    if (!(deductions?.healthInsurance)) {
      recommendations.push('Buy health insurance (₹25,000) → ₹80D deduction → Save ~₹7,500 (Old Regime)');
      potentialSaving += 7500;
    }

    if (!(deductions?.nps)) {
      recommendations.push('NPS contribution ₹50,000 → 80CCD(1B) extra deduction → Save ~₹15,000 (Old Regime)');
      potentialSaving += 15000;
    }

    if (income <= 1275000) {
      recommendations.push('🎉 New Regime: Your income ≤ ₹12,75,000 → ZERO TAX! No investments needed.');
    }

    const betterRegime = income <= 1275000 || (currentDeductions < 300000 && income > 1200000) ? 'NEW' : 'OLD';

    let aiAnalysis = `Income: ₹${income.toLocaleString('en-IN')} | Better Regime: ${betterRegime} | Estimated Saving: ₹${potentialSaving.toLocaleString('en-IN')}`;

    if (this.genAI) {
      const response = await this.askTaxQuestion(`Tax planning for income ₹${income}: ${JSON.stringify(incomeDetails)}. Current deductions: ${JSON.stringify(deductions)}. AY 2026-27.`);
      aiAnalysis = response.answer;
    }

    return { recommendations, estimatedSaving: potentialSaving, regimeAdvice: betterRegime, aiAnalysis };
  }
}
