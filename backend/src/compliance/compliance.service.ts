import { Injectable, Logger } from '@nestjs/common';

/**
 * TaxMitra Enterprise — Compliance Service (Phase 3)
 * Developer: Abhishek Agrahari
 */

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);
  private reminders: any[] = [];

  // ── Full Compliance Calendar ──────────────────────────────

  getCalendar(month?: string, category?: string): any {
    const dueDates = [
      // ── INCOME TAX ──
      { type: 'ITR', category: 'ITR', description: 'ITR Filing (Non-audit individuals/HUF/firms)', dueDate: '2026-07-31', ay: 'AY 2026-27', penalty: '₹5,000 (₹1,000 if income ≤ ₹5L)', section: '139(1) + 234F', priority: 'HIGH' },
      { type: 'ITR_AUDIT', category: 'ITR', description: 'ITR Filing — Audit cases (Sec 44AB)', dueDate: '2026-10-31', ay: 'AY 2026-27', penalty: 'Same as above', section: '139(1)', priority: 'HIGH' },
      { type: 'ADVANCE_TAX_Q1', category: 'ITR', description: 'Advance Tax — Q1 (15% of annual tax)', dueDate: '2025-06-15', fy: 'FY 2025-26', penalty: 'Interest u/s 234C @1% pm', section: '208/211', priority: 'MEDIUM' },
      { type: 'ADVANCE_TAX_Q2', category: 'ITR', description: 'Advance Tax — Q2 (45% cumulative)', dueDate: '2025-09-15', fy: 'FY 2025-26', penalty: 'Interest u/s 234C @1% pm', section: '208/211', priority: 'MEDIUM' },
      { type: 'ADVANCE_TAX_Q3', category: 'ITR', description: 'Advance Tax — Q3 (75% cumulative)', dueDate: '2025-12-15', fy: 'FY 2025-26', penalty: 'Interest u/s 234C @1% pm', section: '208/211', priority: 'MEDIUM' },
      { type: 'ADVANCE_TAX_Q4', category: 'ITR', description: 'Advance Tax — Q4 (100%)', dueDate: '2026-03-15', fy: 'FY 2025-26', penalty: 'Interest u/s 234C @1% pm', section: '208/211', priority: 'HIGH' },
      { type: 'TAX_AUDIT', category: 'ITR', description: 'Tax Audit Report (Form 3CA/3CB + 3CD)', dueDate: '2026-09-30', ay: 'AY 2026-27', penalty: '0.5% of turnover or ₹1.5L (whichever lower)', section: '44AB', priority: 'HIGH' },

      // ── GST MONTHLY ──
      { type: 'GSTR1', category: 'GST', description: 'GSTR-1 (Outward supplies)', dueDate: '2025-08-11', period: 'July 2025', penalty: '₹50/day (nil: ₹20/day)', section: '37 + 47', priority: 'HIGH' },
      { type: 'GSTR3B', category: 'GST', description: 'GSTR-3B (Monthly summary return + tax payment)', dueDate: '2025-08-20', period: 'July 2025', penalty: '₹50/day + 18% interest on unpaid tax', section: '39 + 47 + 50', priority: 'CRITICAL' },
      { type: 'GSTR3B_SEP', category: 'GST', description: 'GSTR-3B — September 2025', dueDate: '2025-09-20', period: 'Aug 2025', penalty: '₹50/day + 18% interest', section: '39 + 47', priority: 'HIGH' },
      { type: 'GSTR9', category: 'GST', description: 'GSTR-9 Annual Return (Turnover > ₹2Cr)', dueDate: '2025-12-31', period: 'FY 2024-25', penalty: '₹200/day (max 0.5% of turnover)', section: '44', priority: 'HIGH' },
      { type: 'GSTR9C', category: 'GST', description: 'GSTR-9C Self-certified Reconciliation (> ₹5Cr)', dueDate: '2025-12-31', period: 'FY 2024-25', penalty: 'Same as GSTR-9', section: '44', priority: 'HIGH' },

      // ── TDS ──
      { type: 'TDS_Q1', category: 'TDS', description: 'TDS Return Q1 (Form 24Q/26Q/27Q)', dueDate: '2025-07-30', quarter: 'Q1 (Apr-Jun 2025)', penalty: '₹200/day', section: '200 + 234E', priority: 'HIGH' },
      { type: 'TDS_Q2', category: 'TDS', description: 'TDS Return Q2 (Form 24Q/26Q/27Q)', dueDate: '2025-10-31', quarter: 'Q2 (Jul-Sep 2025)', penalty: '₹200/day', section: '200 + 234E', priority: 'HIGH' },
      { type: 'TDS_Q3', category: 'TDS', description: 'TDS Return Q3 (Form 24Q/26Q/27Q)', dueDate: '2026-01-31', quarter: 'Q3 (Oct-Dec 2025)', penalty: '₹200/day', section: '200 + 234E', priority: 'HIGH' },
      { type: 'TDS_Q4', category: 'TDS', description: 'TDS Return Q4 (Form 24Q/26Q/27Q)', dueDate: '2026-05-31', quarter: 'Q4 (Jan-Mar 2026)', penalty: '₹200/day', section: '200 + 234E', priority: 'HIGH' },
      { type: 'TDS_MONTHLY', category: 'TDS', description: 'TDS Deposit (7th of next month)', dueDate: '2025-08-07', period: 'July 2025 TDS', penalty: '1.5% pm from deduction to deposit', section: '201(1A)', priority: 'CRITICAL' },
      { type: 'FORM16', category: 'TDS', description: 'Issue Form 16 to employees', dueDate: '2026-06-15', period: 'FY 2025-26', penalty: '₹100/day per certificate', section: '203', priority: 'MEDIUM' },

      // ── ROC ──
      { type: 'MGT7', category: 'ROC', description: 'Annual Return (Form MGT-7A) — OPC/Small Companies', dueDate: '2025-11-30', period: 'FY 2024-25', penalty: '₹200/day', section: '92 Companies Act 2013', priority: 'MEDIUM' },
      { type: 'AOC4', category: 'ROC', description: 'Financial Statements Filing (Form AOC-4)', dueDate: '2025-10-29', period: 'FY 2024-25', penalty: '₹200/day', section: '137 Companies Act', priority: 'MEDIUM' },
      { type: 'DIR3KYC', category: 'ROC', description: 'Director KYC (DIR-3 KYC)', dueDate: '2025-09-30', period: 'Annual', penalty: '₹5,000 (director DIN deactivated)', section: 'Rule 12A Companies Act', priority: 'MEDIUM' },
    ];

    let filtered = dueDates;
    if (category && category !== 'ALL') filtered = filtered.filter(d => d.category === category);

    const now = new Date();
    const enriched = filtered.map(d => {
      const due = new Date(d.dueDate);
      const daysRemaining = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        ...d,
        daysRemaining,
        status: daysRemaining < 0 ? 'OVERDUE' : daysRemaining <= 7 ? 'DUE_SOON' : daysRemaining <= 30 ? 'UPCOMING' : 'FUTURE',
      };
    }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    return {
      generatedFor: month || 'Full Calendar AY 2026-27',
      category: category || 'ALL',
      totalDueDates: enriched.length,
      overdue: enriched.filter(d => d.status === 'OVERDUE').length,
      dueSoon: enriched.filter(d => d.status === 'DUE_SOON').length,
      upcoming: enriched.filter(d => d.status === 'UPCOMING').length,
      dueDates: enriched,
      developer: 'Abhishek Agrahari — TaxMitra AI Enterprise',
    };
  }

  getUpcoming(days = 30, clientId?: string): any {
    const calendar = this.getCalendar();
    const cutoff = days;
    const upcoming = calendar.dueDates.filter((d: any) => d.daysRemaining >= 0 && d.daysRemaining <= cutoff);
    return {
      nextDays: days,
      clientId: clientId || 'all',
      count: upcoming.length,
      critical: upcoming.filter((d: any) => d.priority === 'CRITICAL' || d.priority === 'HIGH').length,
      items: upcoming,
    };
  }

  scheduleReminder(dto: any): any {
    const reminder = {
      id: `rem-${Date.now()}`,
      ...dto,
      status: 'SCHEDULED',
      createdAt: new Date().toISOString(),
    };
    this.reminders.push(reminder);
    this.logger.log(`Reminder scheduled: ${reminder.id} | Type: ${dto.complianceType} | Client: ${dto.clientId}`);
    return {
      ...reminder,
      message: `✅ Reminder scheduled for ${dto.complianceType} (due: ${dto.dueDate}). Alerts: ${(dto.alertDaysBefore || []).join(', ')} days before.`,
      note: 'Phase 4: WhatsApp Business API / Twilio SMS / SendGrid email integration',
    };
  }

  // ── Penalty Calculator ────────────────────────────────────

  calculatePenalty(dto: any): any {
    const { taxDue = 0, advanceTaxPaid = 0, selfAssessmentTaxPaid = 0, filingDate, dueDate, isAuditCase = false } = dto;

    const netTaxDue = Math.max(0, taxDue - advanceTaxPaid - selfAssessmentTaxPaid);
    const filingDateObj = new Date(filingDate || new Date());
    const dueDateObj = new Date(dueDate || '2026-07-31');
    const lateDays = Math.max(0, Math.ceil((filingDateObj.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24)));
    const lateMonths = Math.ceil(lateDays / 30);

    // Section 234A: Late filing interest (1% per month on unpaid tax)
    const interest234A = Math.round(netTaxDue * 0.01 * lateMonths);

    // Section 234B: Default in advance tax (if < 90% paid)
    const advanceTaxRequired = taxDue * 0.9;
    const shortfall234B = Math.max(0, advanceTaxRequired - advanceTaxPaid);
    const interest234B = Math.round(shortfall234B * 0.01 * lateMonths);

    // Section 234C: Deferment of advance tax (installment-wise)
    const interest234C = advanceTaxPaid < taxDue * 0.15 ? Math.round(taxDue * 0.01 * 3) : 0; // Simplified Q1 check

    // Section 234F: Late filing fee
    let lateFee234F = 0;
    if (lateDays > 0) {
      lateFee234F = taxDue <= 500000 ? 1000 : 5000;
    }

    // Section 271(1)(c): Concealment penalty (if applicable)
    const concealmentPenalty = dto.concealment ? Math.round(taxDue * 2) : 0; // 200% typical

    const totalInterest = interest234A + interest234B + interest234C;
    const totalPenalty = lateFee234F + concealmentPenalty;

    return {
      taxDue,
      advanceTaxPaid,
      netTaxDue,
      lateDays,
      lateMonths,
      interest: {
        '234A': { amount: interest234A, description: 'Late filing interest (1% pm on unpaid tax)', section: '234A' },
        '234B': { amount: interest234B, description: 'Advance tax default (1% pm on shortfall)', section: '234B', shortfall: shortfall234B },
        '234C': { amount: interest234C, description: 'Deferred advance tax installment', section: '234C' },
        total: totalInterest,
      },
      penalty: {
        '234F': { amount: lateFee234F, description: lateDays > 0 ? `Late filing fee (filed ${lateDays} days late)` : 'No late fee — filed on time', section: '234F' },
        '271_1_c': { amount: concealmentPenalty, description: 'Concealment penalty (if applicable)', section: '271(1)(c)' },
        total: totalPenalty,
      },
      totalOutstanding: netTaxDue + totalInterest + totalPenalty,
      recommendation: netTaxDue > 0
        ? '⚠️ Pay outstanding tax immediately via Challan 280. Every month of delay adds 1% interest.'
        : '✅ No outstanding tax. Check interest calculations with CA.',
      developer: 'Abhishek Agrahari — TaxMitra AI Enterprise',
    };
  }

  calculateGSTInterest(dto: any): any {
    const { taxDue = 0, dueDate, paymentDate, interestRate = 18, isITC = false } = dto;

    if (!dueDate || !paymentDate) return { error: 'dueDate and paymentDate required' };

    const due = new Date(dueDate);
    const paid = new Date(paymentDate);
    const lateDays = Math.max(0, Math.ceil((paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));

    // GST Interest: 18% p.a. (24% for ITC reversal)
    const effectiveRate = isITC ? 24 : interestRate;
    const dailyRate = effectiveRate / 365 / 100;
    const interest = Math.round(taxDue * dailyRate * lateDays);

    return {
      taxDue,
      dueDate,
      paymentDate,
      lateDays,
      interestRate: `${effectiveRate}% p.a.`,
      interest,
      total: taxDue + interest,
      section: isITC ? 'Section 50(3) — ITC wrongly availed' : 'Section 50(1) — Late tax payment',
      note: lateDays === 0 ? '✅ Paid on time. No interest.' : `₹${interest.toLocaleString('en-IN')} interest for ${lateDays} days delay`,
    };
  }

  penaltySummary(query: any): any {
    return {
      clientId: query.clientId || 'all',
      fy: query.fy || '2025-26',
      pendingPenalties: [
        { type: 'GSTR-3B Interest', amount: 2700, section: '50', status: 'PENDING', period: 'June 2025' },
        { type: '234B Advance Tax', amount: 4500, section: '234B', status: 'PENDING', period: 'AY 2026-27' },
      ],
      totalPendingAmount: 7200,
      recommendation: 'Pay these penalties before ITR filing to avoid notice',
    };
  }

  rocCalendar(fy?: string): any {
    return {
      fy: fy || '2025-26',
      dueDates: [
        { form: 'AOC-4', description: 'Financial Statements', dueDate: '2025-10-29', penalty: '₹200/day' },
        { form: 'MGT-7A', description: 'Annual Return (Small Company/OPC)', dueDate: '2025-11-30', penalty: '₹200/day' },
        { form: 'DIR-3 KYC', description: 'Director KYC', dueDate: '2025-09-30', penalty: '₹5,000' },
        { form: 'ADT-1', description: 'Auditor Appointment', dueDate: '2025-10-15', penalty: '₹300/day' },
        { form: 'MSME-1', description: 'MSME Supplier Dues', dueDate: '2025-10-31', penalty: 'Up to ₹25,000' },
        { form: 'BEN-2', description: 'Beneficial Ownership', dueDate: '2025-12-31', penalty: '₹1L+', frequency: 'Annual' },
      ],
      source: 'Companies Act 2013 + MCA Portal',
    };
  }

  complianceHealthScore(query: any): any {
    // Scoring algorithm: based on ITR/GST/TDS filing history + penalties
    const factors = [
      { name: 'ITR Filed on Time', score: 20, max: 20, status: 'PASS' },
      { name: 'GST Returns Up-to-date', score: 18, max: 20, status: 'PASS' },
      { name: 'TDS Returns Filed', score: 20, max: 20, status: 'PASS' },
      { name: 'No Outstanding Demand', score: 12, max: 15, status: 'WARNING', note: '₹7,200 interest pending' },
      { name: 'AIS/26AS Reconciled', score: 12, max: 15, status: 'WARNING', note: 'Minor mismatch ₹500' },
      { name: 'Advance Tax Paid', score: 8, max: 10, status: 'PASS' },
    ];

    const totalScore = factors.reduce((s, f) => s + f.score, 0);
    const maxScore = factors.reduce((s, f) => s + f.max, 0);
    const percentage = Math.round((totalScore / maxScore) * 100);

    return {
      clientId: query.clientId || 'demo',
      pan: query.pan || 'ABCDE1234F',
      score: totalScore,
      maxScore,
      percentage,
      grade: percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : 'D',
      interpretation: percentage >= 80 ? '✅ Excellent compliance record' : percentage >= 60 ? '⚠️ Good but some issues' : '🔴 Poor compliance — urgent attention needed',
      factors,
      recommendations: [
        'Pay ₹7,200 pending interest before July 31',
        'Reconcile AIS mismatch of ₹500',
      ],
      developer: 'Abhishek Agrahari — TaxMitra AI Enterprise',
    };
  }
}
