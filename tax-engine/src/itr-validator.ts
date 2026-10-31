/**
 * TaxMitra Enterprise — Tax Engine (Pure TypeScript)
 * Developer: Abhishek Agrahari | Kanpur, UP
 *
 * ITR Form Eligibility Validator + Tax Computation Engine
 * Phase 1: Full eligibility matrix + Budget 2025 tax computation
 * Phase 4: JSON Schema validation + IT Portal API submission
 */

export type ITRFormType = 'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4' | 'ITR-5' | 'ITR-6' | 'ITR-7';
export type EntityType = 'individual' | 'huf' | 'firm' | 'llp' | 'company' | 'trust' | 'aop' | 'boi';
export type TaxRegime = 'OLD' | 'NEW';

export interface ITRFormSpec {
  form: ITRFormType;
  eligibleEntities: EntityType[];
  allowedIncomeSources: string[];
  conditions: string[];
  mandatoryConditions?: string[];
  maxIncomeLimit?: number;
  maxTurnoverLimit?: number;
  auditRequired: boolean;
  section: string;
  description: string;
  applicableFrom: string; // AY
}

export interface TaxComputationInput {
  grossSalary?: number;
  businessIncome?: number;
  capitalGainLTCG?: number;
  capitalGainSTCG?: number;
  housePropertyIncome?: number;
  otherIncome?: number;
  foreignIncome?: number;
  cryptoIncome?: number;
  fnoIncome?: number;
  agriculturalIncome?: number;

  // Deductions (Old Regime)
  deduction80C?: number;
  deduction80D_self?: number;
  deduction80D_parents?: number;
  deduction80CCD_1B?: number;
  deduction80G?: number;
  deduction80TTA?: number;
  deduction80TTB?: number;
  deduction80EEA?: number;
  deduction80E?: number;
  hraExemption?: number;
  lta?: number;
  homeLoanInterest?: number;
  standardDeduction?: number;

  // Tax credits
  tdsDeducted?: number;
  advanceTaxPaid?: number;
  tcsCredit?: number;
  selfAssessmentTax?: number;

  regime: TaxRegime;
  entityType?: EntityType;
  age?: number; // for senior citizen checks
  fy?: string;
  ay?: string;
}

export interface TaxComputationResult {
  // Income
  grossIncome: number;
  exemptIncome: number;
  standardDeduction: number;
  deductions: number;
  netTaxableIncome: number;

  // Tax
  basicTax: number;
  surcharge: number;
  cess: number;
  totalTaxBeforeRebate: number;
  rebate87A: number;
  totalTax: number;

  // Special rates
  cryptoTax: number;
  ltcgTax: number;
  stcgTax: number;

  // Credits & Balance
  tdsCredit: number;
  advanceTaxCredit: number;
  balanceTaxPayable: number;
  refundDue: number;

  // Summary
  effectiveRate: string;
  regime: TaxRegime;
  zeroTax: boolean;
  note: string;

  // Slab breakdown
  slabBreakdown: Array<{ range: string; rate: string; tax: number }>;

  // Comparison
  comparisonWithOtherRegime?: Partial<TaxComputationResult>;
}

export class ITRValidator {
  // ── Form Specification Registry ──────────────────────────
  private readonly formSpecs: Record<ITRFormType, ITRFormSpec> = {
    'ITR-1': {
      form: 'ITR-1',
      eligibleEntities: ['individual'],
      allowedIncomeSources: ['Salary', 'OnehouseProperty', 'OtherSources', 'AgriculturalBelow5000'],
      conditions: [
        'Resident individual only (not NRI/RNOR)',
        'Total income does not exceed ₹50,00,000',
        'No business/profession income',
        'No capital gains income',
        'No foreign income or assets',
        'Not a director in a company',
        'No equity shares held in unlisted company',
        'TDS u/s 194N (cash withdrawal) not applicable',
      ],
      mandatoryConditions: ['ResidentIndividual', 'IncomeBelowLimit', 'NoBusinessIncome'],
      maxIncomeLimit: 5000000,
      auditRequired: false,
      section: 'Section 139(1)',
      description: 'For salaried individuals with simple income (salary + one house + others)',
      applicableFrom: 'AY 2024-25',
    },

    'ITR-2': {
      form: 'ITR-2',
      eligibleEntities: ['individual', 'huf'],
      allowedIncomeSources: ['Salary', 'MultipleHouseProperty', 'CapitalGains', 'ForeignIncome', 'OtherSources', 'AgriculturalAbove5000'],
      conditions: [
        'Individual or HUF',
        'No business/profession income',
        'Capital gains from any asset allowed',
        'Multiple house properties allowed',
        'Foreign income / assets allowed',
        'Director in company or unlisted equity shares allowed',
      ],
      auditRequired: false,
      section: 'Section 139(1)',
      description: 'For individuals/HUF with capital gains, foreign income, multiple properties',
      applicableFrom: 'AY 2024-25',
    },

    'ITR-3': {
      form: 'ITR-3',
      eligibleEntities: ['individual', 'huf'],
      allowedIncomeSources: ['Business', 'Profession', 'Salary', 'CapitalGains', 'HouseProperty', 'ForeignIncome', 'OtherSources', 'FnO', 'Crypto'],
      conditions: [
        'Individual or HUF with business/profession income',
        'Partner in a firm (income from firm)',
        'F&O trading income',
        'Tax audit may be required (turnover > ₹1Cr / profession > ₹50L)',
      ],
      auditRequired: true,
      section: 'Section 139(1)',
      description: 'For business/profession income, F&O traders, partners in firms',
      applicableFrom: 'AY 2024-25',
    },

    'ITR-4': {
      form: 'ITR-4',
      eligibleEntities: ['individual', 'huf', 'firm'],
      allowedIncomeSources: ['Business44AD', 'Profession44ADA', 'Salary', 'OneHouseProperty', 'OtherSources'],
      conditions: [
        'Presumptive business income u/s 44AD (turnover ≤ ₹3Cr digital / ₹2Cr otherwise)',
        'Presumptive profession u/s 44ADA (receipts ≤ ₹75L)',
        'No capital gains (except u/s 111A/112)',
        'No foreign income/assets',
        'Resident individual/HUF/firm',
      ],
      maxIncomeLimit: undefined,
      maxTurnoverLimit: 30000000,
      auditRequired: false,
      section: 'Section 44AD / 44ADA',
      description: 'For presumptive taxation — small business and professionals',
      applicableFrom: 'AY 2024-25',
    },

    'ITR-5': {
      form: 'ITR-5',
      eligibleEntities: ['firm', 'llp', 'aop', 'boi'],
      allowedIncomeSources: ['Business', 'CapitalGains', 'HouseProperty', 'OtherSources'],
      conditions: ['For firms, LLPs, AOPs, BOIs, cooperative societies, estates'],
      auditRequired: true,
      section: 'Section 139(1)',
      description: 'For firms, LLPs, AOPs, cooperative societies',
      applicableFrom: 'AY 2024-25',
    },

    'ITR-6': {
      form: 'ITR-6',
      eligibleEntities: ['company'],
      allowedIncomeSources: ['Business', 'CapitalGains', 'HouseProperty', 'OtherSources'],
      conditions: ['All companies except those claiming exemption u/s 11 (Trust)'],
      auditRequired: true,
      section: 'Section 139(1)',
      description: 'For all companies (Pvt Ltd, Public Ltd, OPC)',
      applicableFrom: 'AY 2024-25',
    },

    'ITR-7': {
      form: 'ITR-7',
      eligibleEntities: ['trust', 'company'],
      allowedIncomeSources: ['Business', 'CapitalGains', 'OtherSources'],
      conditions: [
        'Trusts / political parties / research associations / educational institutions',
        'Claims exemption u/s 10(21), 10(22B), 10(23A), 10(23B), 11, 12',
      ],
      auditRequired: true,
      section: 'Section 139(4A)/4B/4C/4D',
      description: 'For trusts, charitable institutions, political parties',
      applicableFrom: 'AY 2024-25',
    },
  };

  // ── Eligibility Validation ────────────────────────────────

  validateEligibility(data: {
    form: ITRFormType;
    entity: EntityType;
    incomeTypes: string[];
    estimatedIncome?: number;
    estimatedTurnover?: number;
    isResident?: boolean;
    hasCapitalGains?: boolean;
    hasForeignAssets?: boolean;
    isDirector?: boolean;
    hasAuditRequired?: boolean;
  }): { valid: boolean; errors: string[]; warnings: string[]; spec: ITRFormSpec | null } {
    const spec = this.formSpecs[data.form];
    if (!spec) return { valid: false, errors: [`Form ${data.form} not found`], warnings: [], spec: null };

    const errors: string[] = [];
    const warnings: string[] = [];

    // Entity check
    if (!spec.eligibleEntities.includes(data.entity)) {
      errors.push(`Form ${data.form} is for ${spec.eligibleEntities.join('/')} — not for ${data.entity}`);
    }

    // Income limit check
    if (spec.maxIncomeLimit && data.estimatedIncome && data.estimatedIncome > spec.maxIncomeLimit) {
      errors.push(`Income ₹${data.estimatedIncome.toLocaleString('en-IN')} exceeds ${data.form} limit of ₹${spec.maxIncomeLimit.toLocaleString('en-IN')}`);
    }

    // Turnover limit check
    if (spec.maxTurnoverLimit && data.estimatedTurnover && data.estimatedTurnover > spec.maxTurnoverLimit) {
      errors.push(`Turnover exceeds ${data.form} limit of ₹${spec.maxTurnoverLimit.toLocaleString('en-IN')}`);
    }

    // Resident check for ITR-1
    if (data.form === 'ITR-1' && data.isResident === false) {
      errors.push('ITR-1 is only for resident individuals. NRIs must use ITR-2.');
    }

    // Capital gains check
    if (data.form === 'ITR-1' && data.hasCapitalGains) {
      errors.push('ITR-1 cannot be used if you have capital gains income. Use ITR-2 or ITR-3.');
    }

    // Foreign assets check
    if (['ITR-1', 'ITR-4'].includes(data.form) && data.hasForeignAssets) {
      errors.push(`${data.form} cannot be used if you have foreign assets/income. Use ITR-2 or ITR-3.`);
    }

    // Director check
    if (data.form === 'ITR-1' && data.isDirector) {
      warnings.push('ITR-1 generally not applicable for directors in companies. Use ITR-2.');
    }

    // Audit warning
    if (spec.auditRequired && !data.hasAuditRequired) {
      warnings.push(`${data.form} typically requires tax audit. Ensure audit is conducted u/s 44AB.`);
    }

    // Income source check
    const invalidSources = data.incomeTypes.filter(s => !spec.allowedIncomeSources.some(allowed => s.toLowerCase().includes(allowed.toLowerCase())));
    if (invalidSources.length) {
      errors.push(`Income sources not allowed in ${data.form}: ${invalidSources.join(', ')}`);
    }

    return { valid: errors.length === 0, errors, warnings, spec };
  }

  recommendForm(data: {
    entity: EntityType;
    incomeTypes: string[];
    estimatedIncome?: number;
    estimatedTurnover?: number;
    isResident?: boolean;
    hasCapitalGains?: boolean;
    hasForeignAssets?: boolean;
    isDirector?: boolean;
    hasBusinessIncome?: boolean;
    presumptiveTaxation?: boolean;
  }): { recommended: ITRFormType; reason: string; alternatives: ITRFormType[] } {
    const { entity, hasBusinessIncome, presumptiveTaxation, hasCapitalGains, hasForeignAssets, isDirector, estimatedIncome, isResident } = data;

    // Company
    if (entity === 'company') return { recommended: 'ITR-6', reason: 'Companies must file ITR-6', alternatives: ['ITR-7'] };
    if (entity === 'trust') return { recommended: 'ITR-7', reason: 'Trusts file ITR-7', alternatives: [] };
    if (entity === 'firm' || entity === 'llp') {
      return presumptiveTaxation
        ? { recommended: 'ITR-4', reason: 'Firms under presumptive taxation use ITR-4', alternatives: ['ITR-5'] }
        : { recommended: 'ITR-5', reason: 'Firms/LLPs use ITR-5', alternatives: [] };
    }

    // Individual / HUF
    if (hasBusinessIncome && !presumptiveTaxation) return { recommended: 'ITR-3', reason: 'Business income requires ITR-3', alternatives: [] };
    if (hasBusinessIncome && presumptiveTaxation) return { recommended: 'ITR-4', reason: 'Presumptive business taxation — ITR-4 (44AD/44ADA)', alternatives: ['ITR-3'] };
    if (hasCapitalGains || hasForeignAssets || isDirector) return { recommended: 'ITR-2', reason: 'Capital gains/foreign income/director requires ITR-2', alternatives: ['ITR-3'] };
    if (!isResident) return { recommended: 'ITR-2', reason: 'NRI must use ITR-2', alternatives: ['ITR-3'] };
    if ((estimatedIncome || 0) <= 5000000 && !hasCapitalGains && !hasForeignAssets && !isDirector) {
      return { recommended: 'ITR-1', reason: 'Simple salaried income below ₹50L — ITR-1 (Sahaj)', alternatives: ['ITR-2'] };
    }
    return { recommended: 'ITR-2', reason: 'Complex income or high amount — use ITR-2', alternatives: ['ITR-3'] };
  }

  // ── Tax Computation Engine (Budget 2025 — AY 2026-27) ────

  computeTax(input: TaxComputationInput): TaxComputationResult {
    const { regime, age = 30, fy = '2025-26' } = input;

    // ── Gross Income ──────────────────────────────────────
    const grossSalary = Math.max(0, input.grossSalary || 0);
    const businessIncome = Math.max(0, input.businessIncome || 0);
    const housePropertyIncome = input.housePropertyIncome || 0; // Can be negative (loss)
    const otherIncome = Math.max(0, input.otherIncome || 0);
    const foreignIncome = Math.max(0, input.foreignIncome || 0);
    const agriculturalIncome = Math.max(0, input.agriculturalIncome || 0); // Exempt

    // Special rate incomes (taxed separately)
    const ltcgIncome = Math.max(0, input.capitalGainLTCG || 0);
    const stcgIncome = Math.max(0, input.capitalGainSTCG || 0);
    const cryptoIncome = Math.max(0, input.cryptoIncome || 0);
    const fnoIncome = input.fnoIncome || 0; // Treated as business

    // ── Standard Deduction ───────────────────────────────
    const stdDeduction = regime === 'NEW' ? Math.min(75000, grossSalary) : Math.min(50000, grossSalary);

    // ── Deductions ────────────────────────────────────────
    let totalDeductions = 0;
    if (regime === 'OLD') {
      const d80C = Math.min(input.deduction80C || 0, 150000);
      const d80D = Math.min((input.deduction80D_self || 0) + (input.deduction80D_parents || 0), age >= 60 ? 100000 : 75000);
      const d80CCD_1B = Math.min(input.deduction80CCD_1B || 0, 50000);
      const d80G = Math.min(input.deduction80G || 0, 100000);
      const d80TTA = Math.min(input.deduction80TTA || 0, 10000);
      const d80TTB = Math.min(input.deduction80TTB || 0, 50000);
      const d80EEA = Math.min(input.deduction80EEA || 0, 150000);
      const d80E = input.deduction80E || 0; // No limit
      const hra = Math.min(input.hraExemption || 0, grossSalary * 0.5);
      const lta = Math.min(input.lta || 0, 25000);
      const hlInterest = Math.min(input.homeLoanInterest || 0, 200000);

      totalDeductions = d80C + d80D + d80CCD_1B + d80G + d80TTA + d80TTB + d80EEA + d80E + hra + lta + hlInterest;
    }

    // ── Net Taxable Income ────────────────────────────────
    const normalIncome = grossSalary - stdDeduction + businessIncome + fnoIncome + otherIncome + foreignIncome + Math.min(housePropertyIncome, 0); // House property loss capped at 2L
    const housePropSetOff = Math.max(housePropertyIncome, -200000); // Section 71(3A)
    const netNormalIncome = Math.max(0, normalIncome + housePropSetOff - totalDeductions);

    // ── Slab Tax Calculation ──────────────────────────────
    // Budget 2025: New Regime
    const newRegimeSlabs = [
      { from: 0, to: 400000, rate: 0 },
      { from: 400000, to: 800000, rate: 5 },
      { from: 800000, to: 1200000, rate: 10 },
      { from: 1200000, to: 1600000, rate: 15 },
      { from: 1600000, to: 2000000, rate: 20 },
      { from: 2000000, to: 2400000, rate: 25 },
      { from: 2400000, to: Infinity, rate: 30 },
    ];

    const oldRegimeSlabs = [
      { from: 0, to: age >= 80 ? 500000 : age >= 60 ? 300000 : 250000, rate: 0 }, // Senior citizen exemptions
      { from: age >= 80 ? 500000 : age >= 60 ? 300000 : 250000, to: 500000, rate: age >= 60 ? 0 : 5 },
      { from: 500000, to: 1000000, rate: 20 },
      { from: 1000000, to: Infinity, rate: 30 },
    ];

    const slabs = regime === 'NEW' ? newRegimeSlabs : oldRegimeSlabs;
    const slabBreakdown: Array<{ range: string; rate: string; tax: number }> = [];

    let slabTax = 0;
    let remaining = netNormalIncome;
    for (const slab of slabs) {
      if (remaining <= 0) break;
      const taxable = Math.min(remaining, slab.to - slab.from);
      const slabTaxAmount = Math.round(taxable * slab.rate / 100);
      if (taxable > 0) {
        slabBreakdown.push({
          range: `₹${slab.from.toLocaleString('en-IN')} - ${slab.to === Infinity ? 'Above' : '₹' + slab.to.toLocaleString('en-IN')}`,
          rate: `${slab.rate}%`,
          tax: slabTaxAmount,
        });
      }
      slabTax += slabTaxAmount;
      remaining -= taxable;
    }

    // ── Special Rate Taxes ────────────────────────────────
    // LTCG: Equity > ₹1.25L at 12.5% (Budget 2024); Non-equity at 20% (with indexation) or 12.5%
    const ltcgExemption = 125000;
    const ltcgTaxable = Math.max(0, ltcgIncome - ltcgExemption);
    const ltcgTax = Math.round(ltcgTaxable * 0.125); // 12.5% post Budget 2024

    // STCG: Equity at 20% (post July 23, 2024 Budget)
    const stcgTax = Math.round(stcgIncome * 0.20); // Section 111A (post Budget 2024)

    // Crypto: 30% flat (Section 115BBH)
    const cryptoTax = Math.round(cryptoIncome * 0.30);

    const totalTaxBeforeRebate = slabTax + ltcgTax + stcgTax;

    // ── 87A Rebate ────────────────────────────────────────
    let rebate87A = 0;
    if (regime === 'NEW' && netNormalIncome <= 1200000 && cryptoIncome === 0 && ltcgIncome === 0) {
      rebate87A = Math.min(totalTaxBeforeRebate, 60000);
    } else if (regime === 'OLD' && netNormalIncome <= 500000) {
      rebate87A = Math.min(totalTaxBeforeRebate, 12500);
    }
    const taxAfterRebate = Math.max(0, totalTaxBeforeRebate - rebate87A);
    const totalTaxWithCrypto = taxAfterRebate + cryptoTax;

    // ── Surcharge ─────────────────────────────────────────
    let surchargeRate = 0;
    const totalIncomeForSurcharge = netNormalIncome + ltcgIncome + stcgIncome + cryptoIncome;
    if (totalIncomeForSurcharge > 50000000) surchargeRate = regime === 'NEW' ? 0.25 : 0.37;
    else if (totalIncomeForSurcharge > 20000000) surchargeRate = 0.25;
    else if (totalIncomeForSurcharge > 10000000) surchargeRate = 0.15;
    else if (totalIncomeForSurcharge > 5000000) surchargeRate = 0.10;

    const surcharge = Math.round(totalTaxWithCrypto * surchargeRate);
    const cess = Math.round((totalTaxWithCrypto + surcharge) * 0.04); // 4% Health & Education Cess
    const totalTax = totalTaxWithCrypto + surcharge + cess;

    // ── Credits ───────────────────────────────────────────
    const tdsCredit = input.tdsDeducted || 0;
    const advanceTaxCredit = input.advanceTaxPaid || 0;
    const tcsCredit = input.tcsCredit || 0;
    const saCredit = input.selfAssessmentTax || 0;
    const totalCredits = tdsCredit + advanceTaxCredit + tcsCredit + saCredit;

    const balanceTaxPayable = Math.max(0, totalTax - totalCredits);
    const refundDue = Math.max(0, totalCredits - totalTax);

    // ── Gross income for display ──────────────────────────
    const grossIncome = grossSalary + businessIncome + fnoIncome + housePropertyIncome + ltcgIncome + stcgIncome + otherIncome + foreignIncome + cryptoIncome + agriculturalIncome;

    const result: TaxComputationResult = {
      grossIncome,
      exemptIncome: agriculturalIncome,
      standardDeduction: stdDeduction,
      deductions: totalDeductions,
      netTaxableIncome: netNormalIncome + ltcgIncome + stcgIncome + cryptoIncome,
      basicTax: slabTax,
      surcharge,
      cess,
      totalTaxBeforeRebate,
      rebate87A,
      totalTax,
      cryptoTax,
      ltcgTax,
      stcgTax,
      tdsCredit,
      advanceTaxCredit,
      balanceTaxPayable,
      refundDue,
      effectiveRate: grossIncome > 0 ? ((totalTax / grossIncome) * 100).toFixed(2) + '%' : '0%',
      regime,
      zeroTax: totalTax === 0,
      note: totalTax === 0 && regime === 'NEW' && grossSalary <= 1275000
        ? '🎉 ZERO TAX — Budget 2025: Gross salary ≤ ₹12,75,000 = ₹0 tax in New Regime (₹75K Std Deduction + ₹60K 87A rebate)'
        : `Tax computed as per Budget 2025 — AY 2026-27 | ${regime} Regime`,
      slabBreakdown,
    };

    return result;
  }

  // ── Regime Comparison ─────────────────────────────────────

  compareRegimes(input: Omit<TaxComputationInput, 'regime'>): {
    new: TaxComputationResult;
    old: TaxComputationResult;
    betterRegime: TaxRegime;
    saving: number;
    recommendation: string;
  } {
    const newResult = this.computeTax({ ...input, regime: 'NEW' });
    const oldResult = this.computeTax({ ...input, regime: 'OLD' });

    const betterRegime: TaxRegime = newResult.totalTax <= oldResult.totalTax ? 'NEW' : 'OLD';
    const saving = Math.abs(newResult.totalTax - oldResult.totalTax);

    return {
      new: newResult,
      old: oldResult,
      betterRegime,
      saving,
      recommendation: betterRegime === 'NEW'
        ? `✅ New Regime saves ₹${saving.toLocaleString('en-IN')}. Recommended unless deductions > ₹${(oldResult.deductions).toLocaleString('en-IN')}.`
        : `✅ Old Regime saves ₹${saving.toLocaleString('en-IN')} due to deductions of ₹${oldResult.deductions.toLocaleString('en-IN')}.`,
    };
  }
}

// ── Export singleton ──────────────────────────────────────
export const itrValidator = new ITRValidator();

// ── Quick test (Node.js) ──────────────────────────────────
if (require.main === module) {
  const result = itrValidator.computeTax({
    grossSalary: 1200000,
    regime: 'NEW',
  });
  console.log('\n=== TaxMitra Tax Engine — AY 2026-27 ===');
  console.log('Gross Salary:  ₹', result.grossIncome.toLocaleString('en-IN'));
  console.log('Std Deduction: ₹', result.standardDeduction.toLocaleString('en-IN'));
  console.log('Net Income:    ₹', result.netTaxableIncome.toLocaleString('en-IN'));
  console.log('Tax:           ₹', result.totalTax.toLocaleString('en-IN'));
  console.log('87A Rebate:    ₹', result.rebate87A.toLocaleString('en-IN'));
  console.log('Zero Tax?', result.zeroTax);
  console.log('Note:', result.note);
  console.log('\nDeveloper: Abhishek Agrahari — TaxMitra AI Enterprise');
}
