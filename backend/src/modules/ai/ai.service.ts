import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { RuleBasedProvider } from './providers/rule-based.provider';
import { ChatDto } from './dto/chat.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly primaryProvider: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiProvider,
    private readonly openai: OpenAIProvider,
    private readonly ruleBased: RuleBasedProvider,
  ) {
    this.primaryProvider = config.get('ai.primaryProvider', 'gemini');
  }

  // ─── Main Chat Entry Point ────────────────────────────────────────────────
  async chat(userId: string, dto: ChatDto) {
    const start = Date.now();
    let response: string;
    let provider = 'rule-based';

    // Build system prompt with tax context
    const systemPrompt = this.buildSystemPrompt(dto.mode, dto.language);

    // Try providers in order: primary → fallback → rule-based
    try {
      if (this.primaryProvider === 'gemini' && this.config.get('ai.geminiKey')) {
        response = await this.gemini.chat(dto.message, systemPrompt, dto.history);
        provider = 'gemini';
      } else if (this.config.get('ai.openaiKey')) {
        response = await this.openai.chat(dto.message, systemPrompt, dto.history);
        provider = 'openai';
      } else {
        throw new Error('No AI API key configured');
      }
    } catch (err) {
      this.logger.warn(`Primary AI failed (${provider}): ${err.message}. Using rule-based.`);
      response = this.ruleBased.getResponse(dto.message, dto.language, dto.mode);
      provider = 'rule-based';
    }

    const latency = Date.now() - start;

    // Save chat to DB
    let chat = await this.prisma.aIChat.findFirst({
      where: { userId, sessionId: dto.sessionId },
    });
    if (!chat) {
      chat = await this.prisma.aIChat.create({
        data: {
          userId,
          sessionId: dto.sessionId || crypto.randomUUID(),
          mode: dto.mode || 'general',
          language: dto.language || 'hi',
        },
      });
    }

    await this.prisma.aIMessage.createMany({
      data: [
        { chatId: chat.id, role: 'user', content: dto.message },
        { chatId: chat.id, role: 'assistant', content: response, aiProvider: provider, latency },
      ],
    });

    return {
      response,
      sessionId: chat.sessionId,
      provider,
      latency,
      suggestions: this.getSuggestions(dto.mode, dto.language),
    };
  }

  // ─── OCR Document Analysis ────────────────────────────────────────────────
  async analyzeDocument(userId: string, documentType: string, extractedText: string) {
    const prompt = `You are a professional Indian tax expert. Analyze this ${documentType} and extract all relevant financial data. Return structured JSON with income amounts, TDS, deductions, and any anomalies found. Document text: ${extractedText.substring(0, 3000)}`;

    let analysis: string;
    try {
      if (this.config.get('ai.geminiKey')) {
        analysis = await this.gemini.analyze(prompt);
      } else {
        analysis = this.ruleBased.analyzeDocument(documentType, extractedText);
      }
    } catch {
      analysis = this.ruleBased.analyzeDocument(documentType, extractedText);
    }

    return { analysis, documentType };
  }

  // ─── Tax Planning AI ─────────────────────────────────────────────────────
  async getTaxPlan(userId: string, income: number, deductions: any) {
    const prompt = `
      As an Indian tax expert for FY 2025-26:
      Income: ₹${income.toLocaleString('en-IN')}
      Current deductions: ${JSON.stringify(deductions)}
      
      Provide:
      1. Old vs New Regime comparison
      2. Specific tax saving recommendations
      3. Investment suggestions for 80C, 80D, NPS
      4. Estimated tax savings possible
      
      Format as structured advice in ${deductions.language || 'Hindi'}.
    `;

    try {
      if (this.config.get('ai.geminiKey')) {
        return { plan: await this.gemini.analyze(prompt), provider: 'gemini' };
      }
    } catch {}

    return {
      plan: this.ruleBased.getTaxPlan(income, deductions),
      provider: 'rule-based',
    };
  }

  // ─── ITR Form Recommendation ──────────────────────────────────────────────
  async recommendITRForm(profile: any) {
    const { entityType, incomeSources, hasCapitalGains, hasForeignAssets, isDirector, totalIncome } = profile;

    let form = 'ITR-1';
    let reason = '';
    let confidence = 95;

    if (entityType === 'COMPANY') { form = 'ITR-6'; reason = 'Company entities must file ITR-6'; }
    else if (entityType === 'TRUST') { form = 'ITR-7'; reason = 'Trusts & NGOs file ITR-7'; }
    else if (['FIRM', 'LLP'].includes(entityType)) { form = 'ITR-5'; reason = 'Firms and LLPs file ITR-5'; }
    else if (incomeSources?.includes('PRESUMPTIVE')) { form = 'ITR-4'; reason = 'Presumptive income u/s 44AD/44ADA'; }
    else if (incomeSources?.includes('BUSINESS') || incomeSources?.includes('PROFESSION')) {
      form = 'ITR-3'; reason = 'Business or professional income';
    } else if (hasCapitalGains || hasForeignAssets || isDirector) {
      form = 'ITR-2'; reason = 'Capital gains / foreign assets / director status';
    } else if (incomeSources?.includes('SALARY') && totalIncome <= 5000000) {
      form = 'ITR-1'; reason = 'Salaried individual with income ≤ ₹50L (Sahaj)';
    } else { form = 'ITR-2'; confidence = 80; reason = 'Complex income profile'; }

    return { form, reason, confidence, alternativeForms: [] };
  }

  // ─── Notice Explanation ───────────────────────────────────────────────────
  async explainNotice(userId: string, noticeText: string, section: string) {
    const prompt = `
      Explain this Income Tax notice (Section ${section}) in simple Hindi and English for a common taxpayer:
      Notice: ${noticeText.substring(0, 2000)}
      
      Provide:
      1. What does this notice mean
      2. Why was it issued (common reasons)
      3. Step-by-step what to do
      4. Documents required
      5. Deadline (if applicable)
      6. Consequences of not responding
    `;

    try {
      if (this.config.get('ai.geminiKey')) {
        return { explanation: await this.gemini.analyze(prompt), provider: 'gemini' };
      }
    } catch {}

    return { explanation: this.ruleBased.explainNotice(section), provider: 'rule-based' };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  private buildSystemPrompt(mode: string, language: string): string {
    const lang = language === 'en' ? 'English' : 'Hindi (with English technical terms)';
    const modes: Record<string, string> = {
      general: 'You are TaxMitra AI, an expert Indian tax assistant. Answer in ' + lang + '. Cover ITR, GST, TDS, investments.',
      itr: 'You are an ITR filing expert. Focus on ITR form selection, AIS, Form 16, deductions. Respond in ' + lang,
      gst: 'You are a GST expert. Cover GSTR-1, GSTR-3B, ITC, e-invoice, HSN codes. Respond in ' + lang,
      notice: 'You are an Income Tax notice expert. Explain notices simply and guide on response. Use ' + lang,
      invest: 'You are a financial advisor specialising in tax-saving investments in India. Advise in ' + lang,
      planner: 'You are a tax planning expert. Optimise for minimum tax liability legally. Use ' + lang,
    };
    return (modes[mode] || modes.general) +
      '\n\nContext: FY 2025-26 / AY 2026-27. New Tax Regime is default from FY 2023-24. Always be accurate and caveat with "consult a CA for final decisions".';
  }

  private getSuggestions(mode: string, language: string): string[] {
    const isHindi = language !== 'en';
    const suggestions: Record<string, string[]> = {
      general: isHindi
        ? ['ITR form kaunsa bharna chahiye?', 'Old vs New Regime mein kya difference hai?', 'Section 80C tips batao']
        : ['Which ITR form should I file?', 'Old vs New Regime difference?', 'Best 80C investment options?'],
      gst: ['GSTR-1 kab file karni hai?', 'ITC claim kaise karein?', 'E-invoice mandatory hai?'],
      itr: ['ITR-1 vs ITR-2 difference?', 'AIS mein discrepancy hai, kya karein?', 'Refund kab aayega?'],
    };
    return suggestions[mode] || suggestions.general;
  }

  // ─── Chat History ─────────────────────────────────────────────────────────
  async getChatHistory(userId: string, sessionId?: string) {
    return this.prisma.aIChat.findMany({
      where: { userId, ...(sessionId && { sessionId }) },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 50 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
  }
}
