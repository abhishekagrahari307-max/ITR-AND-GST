import { Injectable } from '@nestjs/common';

@Injectable()
export class RuleBasedProvider {
  private readonly kb: Record<string, Record<string, string>> = {
    hi: {
      itr: `📋 **ITR Form Selection Guide:**\n\n• **ITR-1 (Sahaj)**: Salary/pension, 1 house property, income ≤ ₹50L\n• **ITR-2**: Capital gains, foreign assets, 2+ properties\n• **ITR-3**: Business/profession income\n• **ITR-4 (Sugam)**: Presumptive income (44AD/44ADA)\n• **ITR-5**: Partnership firms, LLPs\n• **ITR-6**: Companies\n• **ITR-7**: Trusts, NGOs\n\n**Aapki income source kya hai?**`,
      gst: `🧾 **GST Filing Guide:**\n\n**Monthly Returns:**\n• GSTR-1: 11th | GSTR-3B: 20th\n\n**Annual:**\n• GSTR-9: 31 December\n\n**Interest:** 18% p.a. | **Late fee:** ₹50/day\n\nKisi specific return mein help chahiye?`,
      regime: `⚖️ **Old vs New Regime:**\n\n🔵 **Old Regime**: Higher slabs + all deductions (80C, HRA, 80D)\n🟢 **New Regime** (Default): Lower slabs, ₹75K std deduction, no other deductions\n\n**Break-even:** ~₹3.75L total deductions\n• Deductions > ₹3.75L → Old Regime better\n• Deductions < ₹3.75L → New Regime better\n\nApni income batao, exact calculate karta hoon!`,
      '80c': `💡 **Section 80C (Max ₹1.5L - Old Regime):**\n\n• PPF: 7.1%, EEE, govt backed\n• ELSS: 12-18% returns, 3yr lock-in\n• EPF: Auto salary deduction, 8.25%\n• LIC Premium\n• Home Loan Principal\n• NSC / Sukanya Samriddhi\n\n**Best combo:** PPF + ELSS 🏆`,
      notice: `🔔 **IT Notice Mila Hai? Ghabrao Mat!**\n\n**Common Notices:**\n• **143(1)**: Intimation – just check it\n• **143(2)**: Scrutiny – documents submit karo\n• **148**: Income escapement\n• **156**: Demand notice\n\n**Steps:**\n1. Deadline note karo (30 days usually)\n2. Documents gather karo\n3. e-Proceedings portal pe respond karo\n4. CA se consult karo`,
      tds: `💼 **TDS Guide:**\n\n**Common Rates:**\n• Salary (192): As per slab\n• Bank Interest (194A): 10%\n• Rent (194I): 10%\n• Professional Fees (194J): 10%\n• Contractor (194C): 1%/2%\n\n**TDS Due Date:** 7th of next month\n**Return Due:** Q1: 31 Jul | Q2: 31 Oct | Q3: 31 Jan | Q4: 31 May`,
      invest: `📈 **Investment Guide:**\n\n**Tax Saving:**\n• PPF: 7.1%, EEE | NPS: Extra ₹50K (80CCD1B)\n• ELSS: Best returns, 3yr lock-in\n• Sukanya: 8.2%, girl child\n\n**Wealth Building:**\n• SIP Index Funds: 12-15% CAGR\n• Sovereign Gold Bond: Tax-free maturity\n\n**Rule:** Emergency fund pehle banao (6 months) 🎯`,
      default: `नमस्ते! 🙏 मैं TaxMitra AI हूँ। इन topics में help कर सकता हूँ:\n\n📋 **ITR Forms** | ⚖️ **Old vs New Regime** | 💡 **80C Deductions**\n🧾 **GST Filing** | 💼 **TDS** | 🔔 **Notice** | 📈 **Investments**\n\nकोई भी topic पूछें!`,
    },
    en: {
      itr: `📋 **ITR Form Selection:**\n\n• **ITR-1**: Salary ≤₹50L, 1 house property\n• **ITR-2**: Capital gains, foreign assets\n• **ITR-3**: Business/profession\n• **ITR-4**: Presumptive (44AD/44ADA)\n• **ITR-5**: Firms, LLPs\n• **ITR-6**: Companies\n• **ITR-7**: Trusts, NGOs`,
      gst: `🧾 **GST Filing:** GSTR-1: 11th | GSTR-3B: 20th | GSTR-9 Annual: 31 Dec\nInterest: 18% pa | Late fee: ₹50/day`,
      regime: `⚖️ New Regime (default): Lower slabs, ₹75K std deduction, zero tax ≤₹12.75L\nOld Regime: Higher slabs + all deductions. Break-even: ~₹3.75L deductions`,
      '80c': `💡 Section 80C (max ₹1.5L): PPF, ELSS, EPF, LIC, NSC, Home Loan Principal. Best: PPF + ELSS combo`,
      notice: `🔔 Notice received? Don't panic! Check section, gather docs, respond on e-Proceedings within 30 days, consult CA`,
      tds: `💼 TDS: 192-Salary (slab), 194A-Interest (10%), 194C-Contractor (1/2%), 194J-Professional (10%), 194I-Rent (10%)`,
      invest: `📈 Tax saving: PPF(EEE), NPS(+₹50K via 80CCD1B), ELSS(best returns). Wealth: SIP index funds 12-15% CAGR`,
      default: `Hello! I'm TaxMitra AI. Ask me about ITR, GST, TDS, tax saving, investments or any Indian tax matter!`,
    },
  };

  getResponse(message: string, language = 'hi', mode = 'general'): string {
    const m = message.toLowerCase();
    const lang = language === 'en' ? 'en' : 'hi';
    const r = this.kb[lang];

    if (m.includes('itr') || m.includes('form') || m.includes('return') || m.includes('file')) return r.itr;
    if (m.includes('gst') || m.includes('gstr') || m.includes('invoice')) return r.gst;
    if (m.includes('regime') || m.includes('old') || m.includes('new tax') || m.includes('slab')) return r.regime;
    if (m.includes('80c') || m.includes('deduction') || m.includes('ppf') || m.includes('elss')) return r['80c'];
    if (m.includes('notice') || m.includes('143') || m.includes('148') || m.includes('demand')) return r.notice;
    if (m.includes('tds') || m.includes('tcs') || m.includes('26q') || m.includes('24q')) return r.tds;
    if (m.includes('invest') || m.includes('sip') || m.includes('nps') || m.includes('mutual')) return r.invest;

    return r.default;
  }

  analyzeDocument(type: string, text: string): string {
    const extracted: Record<string, any> = {};
    // Extract salary
    const salaryMatch = text.match(/gross\s+salary[:\s]+₹?([\d,]+)/i);
    if (salaryMatch) extracted.grossSalary = salaryMatch[1];
    // Extract TDS
    const tdsMatch = text.match(/tax\s+deducted[:\s]+₹?([\d,]+)/i);
    if (tdsMatch) extracted.tdsDeducted = tdsMatch[1];
    return `Document Type: ${type}\nExtracted Data: ${JSON.stringify(extracted, null, 2)}\nAI Summary: Document processed successfully. Please verify extracted values manually.`;
  }

  getTaxPlan(income: number, deductions: any): string {
    const stdDed = 75000;
    const taxable = Math.max(0, income - stdDed);
    let newTax = 0;
    if (taxable > 300000) newTax = Math.min((taxable - 300000) * 0.05, 20000);
    if (taxable > 700000) newTax += (taxable - 700000) * 0.10;
    newTax = Math.round(newTax * 1.04);
    return `Tax Plan for ₹${income.toLocaleString('en-IN')} income:\n\nNew Regime Tax: ₹${newTax.toLocaleString('en-IN')}\nRecommendation: ${newTax > 0 ? 'Invest in NPS for additional ₹50K deduction' : 'Zero tax with 87A rebate!'}`;
  }

  explainNotice(section: string): string {
    const notices: Record<string, string> = {
      '143(1)': '**Section 143(1) – Intimation**\n\nYeh sirf ek information letter hai, not a serious notice.\n\n**Kya karein:** Tax demand ya refund amount check karo. Agar koi discrepancy hai toh rectification file karo within 30 days.',
      '143(2)': '**Section 143(2) – Scrutiny**\n\nIT Department aapka return detailed mein check karna chahta hai.\n\n**Kya karein:** Documents ready rakho, e-Proceedings portal pe respond karo within given time.',
      '148': '**Section 148 – Income Escapement**\n\nDepartment ko lagta hai aapne kuch income chhupayi hai.\n\n**Kya karein:** Immediately CA se consult karo. Response time typically 30 days.',
      '156': '**Section 156 – Demand Notice**\n\nAapko tax payment karni hai.\n\n**Kya karein:** 30 days mein pay karo ya appeal file karo.',
    };
    return notices[section] || `**Section ${section} Notice**\n\nCA se turant consult karo aur e-Proceedings portal pe respond karo within stipulated time.`;
  }
}
