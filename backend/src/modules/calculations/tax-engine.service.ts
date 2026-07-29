import { Injectable } from '@nestjs/common';

// ─── Computax-Style Professional Tax Computation Engine ───────────────────
@Injectable()
export class TaxEngineService {

  // ─── New Regime Slabs (FY 2025-26 / AY 2026-27) ─────────────────────────
  private readonly NEW_REGIME_SLABS = [
    { min: 0,        max: 300000,  rate: 0.00 },
    { min: 300001,   max: 700000,  rate: 0.05 },
    { min: 700001,   max: 1000000, rate: 0.10 },
    { min: 1000001,  max: 1200000, rate: 0.15 },
    { min: 1200001,  max: 1500000, rate: 0.20 },
    { min: 1500001,  max: Infinity,rate: 0.30 },
  ];

  // ─── Old Regime Slabs ────────────────────────────────────────────────────
  private readonly OLD_REGIME_SLABS = {
    below60: [
      { min: 0,       max: 250000,  rate: 0.00 },
      { min: 250001,  max: 500000,  rate: 0.05 },
      { min: 500001,  max: 1000000, rate: 0.20 },
      { min: 1000001, max: Infinity,rate: 0.30 },
    ],
    '60to80': [
      { min: 0,       max: 300000,  rate: 0.00 },
      { min: 300001,  max: 500000,  rate: 0.05 },
      { min: 500001,  max: 1000000, rate: 0.20 },
      { min: 1000001, max: Infinity,rate: 0.30 },
    ],
    above80: [
      { min: 0,       max: 500000,  rate: 0.00 },
      { min: 500001,  max: 1000000, rate: 0.20 },
      { min: 1000001, max: Infinity,rate: 0.30 },
    ],
  };

  // ─── Surcharge Rates ─────────────────────────────────────────────────────
  private readonly SURCHARGE = [
    { min: 0,         max: 5000000,  rate: 0.00 },
    { min: 5000001,   max: 10000000, rate: 0.10 },
    { min: 10000001,  max: 20000000, rate: 0.15 },
    { min: 20000001,  max: 50000000, rate: 0.25 },
    { min: 50000001,  max: Infinity, rate: 0.37 }, // Note: max 25% for new regime
  ];

  // ─── Main Computation ────────────────────────────────────────────────────
  computeIncomeTax(params: {
    grossIncome: number;
    regime: 'OLD' | 'NEW';
    age?: 'below60' | '60to80' | 'above80';
    entityType?: string;
    deductions?: {
      d80C?: number; d80CCD?: number; d80D?: number;
      d80E?: number; d80G?: number; d80TTA?: number;
      hra?: number; homeLoan?: number; other?: number;
    };
    tdsDeducted?: number;
    advanceTaxPaid?: number;
    capitalGains?: { stcgEquity?: number; ltcgEquity?: number; stcgOther?: number; ltcgOther?: number; };
  }) {
    const {
      grossIncome, regime, age = 'below60', entityType = 'INDIVIDUAL',
      deductions = {}, tdsDeducted = 0, advanceTaxPaid = 0, capitalGains = {},
    } = params;

    const result: any = {
      grossIncome, regime, age,
      slabs: [],
      deductionDetails: {},
      capitalGainsTax: {},
    };

    // ─── Standard Deduction ──────────────────────────────────────────────
    result.standardDeduction = regime === 'NEW' ? 75000 : 50000;

    // ─── Other Deductions (Old Regime only) ─────────────────────────────
    let otherDeductions = 0;
    if (regime === 'OLD') {
      const d80C  = Math.min(deductions.d80C  || 0, 150000);
      const d80CCD = Math.min(deductions.d80CCD || 0, 50000);
      const d80D  = Math.min(deductions.d80D  || 0, 75000);
      const d80E  = deductions.d80E  || 0;
      const d80G  = deductions.d80G  || 0;
      const d80TTA = Math.min(deductions.d80TTA || 0, 10000);
      const hra   = deductions.hra   || 0;
      const homeLoan = Math.min(deductions.homeLoan || 0, 200000);
      const other = deductions.other || 0;
      otherDeductions = d80C + d80CCD + d80D + d80E + d80G + d80TTA + hra + homeLoan + other;
      result.deductionDetails = { d80C, d80CCD, d80D, d80E, d80G, d80TTA, hra, homeLoan, other, total: otherDeductions };
    }

    // ─── Taxable Income ──────────────────────────────────────────────────
    result.totalDeductions = result.standardDeduction + otherDeductions;
    result.taxableIncome   = Math.max(0, grossIncome - result.totalDeductions);

    // ─── Slab Tax Calculation ────────────────────────────────────────────
    result.taxBeforeRebate = this.calculateSlabTax(
      result.taxableIncome,
      regime === 'NEW' ? this.NEW_REGIME_SLABS : (this.OLD_REGIME_SLABS[age] || this.OLD_REGIME_SLABS.below60),
      result.slabs,
    );

    // ─── Capital Gains Tax ───────────────────────────────────────────────
    let cgTax = 0;
    if (Object.keys(capitalGains).length) {
      const stcgEq  = Math.round((capitalGains.stcgEquity  || 0) * 0.20);
      const ltcgEq  = Math.round(Math.max(0, (capitalGains.ltcgEquity || 0) - 125000) * 0.125);
      const stcgOth = Math.round((capitalGains.stcgOther   || 0) * 0.30);
      const ltcgOth = Math.round((capitalGains.ltcgOther   || 0) * 0.20);
      cgTax = stcgEq + ltcgEq + stcgOth + ltcgOth;
      result.capitalGainsTax = { stcgEq, ltcgEq, stcgOth, ltcgOth, total: cgTax };
    }

    // ─── Rebate u/s 87A ──────────────────────────────────────────────────
    if (regime === 'NEW' && result.taxableIncome <= 1200000) {
      result.rebate87A = Math.min(result.taxBeforeRebate, 60000);
    } else if (regime === 'OLD' && result.taxableIncome <= 500000) {
      result.rebate87A = Math.min(result.taxBeforeRebate, 12500);
    } else {
      result.rebate87A = 0;
    }

    result.taxAfterRebate = Math.max(0, result.taxBeforeRebate - result.rebate87A) + cgTax;

    // ─── Surcharge ───────────────────────────────────────────────────────
    result.surcharge = this.calculateSurcharge(result.taxAfterRebate, grossIncome, regime);

    // ─── Cess ────────────────────────────────────────────────────────────
    result.cess = Math.round((result.taxAfterRebate + result.surcharge) * 0.04);

    // ─── Total Tax ───────────────────────────────────────────────────────
    result.totalTaxLiability = result.taxAfterRebate + result.surcharge + result.cess;

    // ─── Marginal Relief ─────────────────────────────────────────────────
    result.marginalRelief = this.calculateMarginalRelief(grossIncome, result.totalTaxLiability);

    // ─── Net Tax After Marginal Relief ───────────────────────────────────
    result.netTaxLiability = result.totalTaxLiability - result.marginalRelief;

    // ─── Balance Tax / Refund ────────────────────────────────────────────
    const taxCredits = tdsDeducted + advanceTaxPaid;
    result.tdsDeducted     = tdsDeducted;
    result.advanceTaxPaid  = advanceTaxPaid;
    result.totalTaxCredits = taxCredits;
    result.balanceTax      = Math.max(0, result.netTaxLiability - taxCredits);
    result.refundAmount    = Math.max(0, taxCredits - result.netTaxLiability);

    // ─── Interest Calculations ───────────────────────────────────────────
    result.interest = this.calculateInterest(result.netTaxLiability, tdsDeducted, advanceTaxPaid);

    // ─── Effective Rate ──────────────────────────────────────────────────
    result.effectiveTaxRate = grossIncome > 0
      ? ((result.netTaxLiability / grossIncome) * 100).toFixed(2)
      : '0.00';

    return result;
  }

  // ─── Slab Tax Helper ────────────────────────────────────────────────────
  private calculateSlabTax(income: number, slabs: any[], breakdown: any[]): number {
    let tax = 0;
    for (const slab of slabs) {
      if (income <= 0) break;
      if (income > slab.min - 1) {
        const taxable = Math.min(income, slab.max) - (slab.min - 1);
        const slabTax = Math.round(taxable * slab.rate);
        tax += slabTax;
        if (slabTax > 0) breakdown.push({ range: `₹${slab.min.toLocaleString()} - ₹${slab.max === Infinity ? '∞' : slab.max.toLocaleString()}`, rate: `${slab.rate * 100}%`, amount: taxable, tax: slabTax });
      }
    }
    return tax;
  }

  // ─── Surcharge ──────────────────────────────────────────────────────────
  private calculateSurcharge(tax: number, income: number, regime: string): number {
    const maxSurchargeRate = regime === 'NEW' ? 0.25 : 0.37;
    for (const s of this.SURCHARGE) {
      if (income >= s.min && income <= s.max) {
        return Math.round(tax * Math.min(s.rate, maxSurchargeRate));
      }
    }
    return 0;
  }

  // ─── Marginal Relief ────────────────────────────────────────────────────
  private calculateMarginalRelief(income: number, totalTax: number): number {
    const thresholds = [500000, 1000000, 2000000, 5000000];
    for (const threshold of thresholds) {
      if (income > threshold && income <= threshold * 1.1) {
        const excessIncome = income - threshold;
        const taxAtThreshold = this.computeIncomeTax({ grossIncome: threshold, regime: 'NEW' }).netTaxLiability;
        const relief = Math.max(0, totalTax - taxAtThreshold - excessIncome);
        if (relief > 0) return relief;
      }
    }
    return 0;
  }

  // ─── Interest u/s 234A/B/C ──────────────────────────────────────────────
  private calculateInterest(taxLiability: number, tds: number, advanceTax: number) {
    const netTax = Math.max(0, taxLiability - tds);
    // 234B: If advance tax < 90% of net tax
    const advanceTaxRequired = netTax * 0.9;
    const interest234B = advanceTax < advanceTaxRequired
      ? Math.round((netTax - advanceTax) * 0.01)  // 1% per month (simplified)
      : 0;
    return { '234A': 0, '234B': interest234B, '234C': 0, total: interest234B };
  }

  // ─── HRA Exemption ──────────────────────────────────────────────────────
  computeHRAExemption(basic: number, hraReceived: number, rentPaid: number, isMetro: boolean) {
    const rule1 = hraReceived;
    const rule2 = basic * (isMetro ? 0.50 : 0.40);
    const rule3 = Math.max(0, rentPaid - basic * 0.10);
    const exemption = Math.min(rule1, rule2, rule3);
    return { rule1, rule2, rule3, exemption, taxableHRA: hraReceived - exemption };
  }

  // ─── Capital Gain Calculator ─────────────────────────────────────────────
  computeCapitalGain(buyPrice: number, sellPrice: number, assetType: string, isLTCG: boolean, improve = 0) {
    const gain = sellPrice - buyPrice - improve;
    let rate = 0; let exemption = 0;
    if (assetType === 'equity') {
      rate    = isLTCG ? 0.125 : 0.20;
      exemption = isLTCG ? 125000 : 0;
    } else if (assetType === 'property') {
      rate = isLTCG ? 0.20 : 0.30;
    } else {
      rate = isLTCG ? 0.20 : 0.30;
    }
    const taxableGain = Math.max(0, gain - exemption);
    const tax = Math.round(taxableGain * rate * 1.04);
    return { gain, taxableGain, exemption, rate, tax, netProfit: gain - tax };
  }

  // ─── SIP Calculator ─────────────────────────────────────────────────────
  computeSIP(monthlyAmount: number, annualReturn: number, years: number) {
    const r = annualReturn / 100 / 12;
    const n = years * 12;
    const fv = Math.round(monthlyAmount * (Math.pow(1 + r, n) - 1) / r * (1 + r));
    const invested = monthlyAmount * n;
    return { futureValue: fv, invested, returns: fv - invested, wealthRatio: (fv / invested).toFixed(2) };
  }

  // ─── EMI Calculator ─────────────────────────────────────────────────────
  computeEMI(principal: number, annualRate: number, years: number) {
    const r = annualRate / 100 / 12;
    const n = years * 12;
    const emi = Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
    const total = emi * n;
    return { emi, totalPayment: total, totalInterest: total - principal, principal };
  }

  // ─── Gratuity ────────────────────────────────────────────────────────────
  computeGratuity(basicDA: number, years: number, isCovered: boolean) {
    const gratuity = isCovered
      ? Math.round((basicDA * 15 * years) / 26)
      : Math.round((basicDA * 15 * years) / 30);
    const taxFree  = Math.min(gratuity, 2000000);
    const taxable  = Math.max(0, gratuity - taxFree);
    return { gratuity, taxFree, taxable };
  }

  // ─── GST Calculation ─────────────────────────────────────────────────────
  computeGST(amount: number, rate: number, isInclusive: boolean, isInterState: boolean) {
    const base  = isInclusive ? amount / (1 + rate / 100) : amount;
    const gst   = base * rate / 100;
    const total = base + gst;
    const half  = gst / 2;
    return {
      baseAmount: Math.round(base),
      cgst: isInterState ? 0 : Math.round(half),
      sgst: isInterState ? 0 : Math.round(half),
      igst: isInterState ? Math.round(gst) : 0,
      totalGST: Math.round(gst),
      grandTotal: Math.round(total),
    };
  }

  // ─── Old vs New Regime Comparison ────────────────────────────────────────
  compareRegimes(income: number, deductions: any) {
    const newResult = this.computeIncomeTax({ grossIncome: income, regime: 'NEW' });
    const oldResult = this.computeIncomeTax({ grossIncome: income, regime: 'OLD', deductions });
    const saving = Math.abs(newResult.netTaxLiability - oldResult.netTaxLiability);
    const betterRegime = newResult.netTaxLiability <= oldResult.netTaxLiability ? 'NEW' : 'OLD';
    return {
      newRegime: newResult,
      oldRegime: oldResult,
      savingAmount: saving,
      recommendation: betterRegime,
      message: betterRegime === 'NEW'
        ? `New Regime mein ₹${saving.toLocaleString('en-IN')} zyada bachenge!`
        : `Old Regime mein ₹${saving.toLocaleString('en-IN')} zyada bachenge (deductions ke saath)!`,
    };
  }
}
