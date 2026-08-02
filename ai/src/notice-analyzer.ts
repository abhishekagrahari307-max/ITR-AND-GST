/**
 * TaxMitra Enterprise — Notice Analyzer (Phase 2)
 * Developer: Abhishek Agrahari
 * Decodes IT/GST notices into plain Hindi/English with action plan
 */

import { GeminiTaxAssistant } from './gemini-client';

const NOTICE_PATTERNS = [
  { pattern: /143\(1\)/i, type: 'Intimation u/s 143(1)', urgency: 'medium' as const, action: 'Verify computation. If demand, pay or rectify. If refund, check bank account.' },
  { pattern: /143\(2\)/i, type: 'Scrutiny Notice u/s 143(2)', urgency: 'high' as const, action: 'Respond with all documents within time limit. Engage CA immediately.' },
  { pattern: /143\(3\)/i, type: 'Assessment Order u/s 143(3)', urgency: 'high' as const, action: 'Review order. File appeal u/s 246A within 30 days if disputed.' },
  { pattern: /148/i, type: 'Reassessment Notice u/s 148', urgency: 'high' as const, action: 'File objection within 30 days. Provide original filing details.' },
  { pattern: /271/i, type: 'Penalty Notice u/s 271', urgency: 'high' as const, action: 'Show cause response required. Attach reasonable cause proof. Apply u/s 273A for waiver.' },
  { pattern: /GST|GSTR|GSTIN/i, type: 'GST Notice', urgency: 'medium' as const, action: 'Check notice type. File reply on GST portal. Provide reconciliation statement.' },
  { pattern: /TDS|194/i, type: 'TDS Notice', urgency: 'medium' as const, action: 'Verify TDS deducted and deposited. Check 26AS/TRACES.' },
  { pattern: /refund/i, type: 'Refund Related Communication', urgency: 'low' as const, action: 'Verify bank account pre-validation on IT Portal.' },
];

export class NoticeAnalyzer {
  private gemini: GeminiTaxAssistant;

  constructor(apiKey?: string) {
    this.gemini = new GeminiTaxAssistant(apiKey);
  }

  async analyze(noticeText: string, userProfile?: any): Promise<{
    explanation: string;
    noticeType: string;
    actions: string[];
    urgency: 'low' | 'medium' | 'high';
    deadline?: string;
    riskScore: number;
    sections: string[];
  }> {
    // Detect notice type
    let noticeType = 'General Tax Notice';
    let urgency: 'low' | 'medium' | 'high' = 'medium';
    let defaultAction = 'Respond to notice within time limit given. Consult CA.';

    for (const pattern of NOTICE_PATTERNS) {
      if (pattern.pattern.test(noticeText)) {
        noticeType = pattern.type;
        urgency = pattern.urgency;
        defaultAction = pattern.action;
        break;
      }
    }

    // Extract sections mentioned
    const sectionMatches = noticeText.match(/(?:Section|Sec\.?|u\/s)\s*(\d+[A-Z]?(?:\(\d+\))?)/gi) || [];
    const sections = [...new Set(sectionMatches.map(s => s.replace(/\s+/g, ' ').trim()))];

    // Risk score (0-1)
    const riskScore = urgency === 'high' ? 0.8 : urgency === 'medium' ? 0.5 : 0.3;

    // Get AI explanation
    const aiResponse = await this.gemini.explainNotice(noticeText);

    const deadline = new Date(Date.now() + (urgency === 'high' ? 7 : urgency === 'medium' ? 15 : 30) * 86400000).toISOString().slice(0, 10);

    return {
      explanation: aiResponse.explanation,
      noticeType,
      actions: [
        ...aiResponse.actions,
        defaultAction,
        'Keep all original documents ready',
        urgency === 'high' ? '⚠️ HIGH PRIORITY — Do not delay' : '📌 Respond within deadline',
      ],
      urgency,
      deadline,
      riskScore,
      sections,
    };
  }
}
