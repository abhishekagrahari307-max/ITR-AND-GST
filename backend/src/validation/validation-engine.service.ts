import { Injectable, Logger } from '@nestjs/common';

/**
 * TaxMitra Enterprise — Validation Engine Service
 * Developer: Abhishek Agrahari | Kanpur, UP
 *
 * Target: 1000+ Validation Rules across 6 Core Categories
 * Phase 1: Skeleton with ~50 rules per category (expandable)
 * Phase 4: Load from DB / YAML / JSON / Drools Rule Engine
 *
 * Categories (per User's Enterprise Framework):
 *   1. Personal     → PAN, Aadhaar, DOB, Mobile, Email
 *   2. Income       → Salary, HRA, House Property, Capital Gain, Business, F&O, Crypto, Foreign
 *   3. Deductions   → 80C, 80D, 80CCD, 80G, 80TTA, 80TTB, 80EEA, etc.
 *   4. GST          → GSTIN, Invoice, HSN/SAC, ITC, Reconciliation
 *   5. Banking      → IFSC, Account, Refund Account, Bank Name
 *   6. Filing       → ITR Form Eligibility, JSON Schema, Mandatory, Duplicate, Cross-check
 */

export interface ValidationRule {
  id: string;
  category: string;
  subcategory: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  validate: (data: any) => boolean;
  message: string;
  section?: string; // Income Tax Act section reference
}

export interface ValidationResult {
  category: string;
  valid: boolean;
  totalRules: number;
  passed: number;
  failed: number;
  warnings: number;
  errors: ValidationError[];
  warnings_list: ValidationWarning[];
  dataSnapshot: any;
  timestamp: string;
  executionMs: number;
}

export interface ValidationError {
  ruleId: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
  section?: string;
  suggestedFix?: string;
}

export interface ValidationWarning {
  ruleId: string;
  message: string;
  section?: string;
}

@Injectable()
export class ValidationEngineService {
  private readonly logger = new Logger(ValidationEngineService.name);

  // ── Category Registry ──────────────────────────────────────
  private readonly categories = [
    'personal',
    'income',
    'deductions',
    'gst',
    'banking',
    'filing',
  ];

  // ── Rule Definitions ──────────────────────────────────────
  // Phase 1: ~50 rules per category skeleton
  // Phase 4: 1000+ rules loaded from DB/YAML/Drools
  private readonly rules: Record<string, ValidationRule[]> = {

    // ── PERSONAL RULES ─────────────────────────────────────
    personal: [
      {
        id: 'P001', category: 'personal', subcategory: 'pan',
        description: 'PAN format validation',
        severity: 'error',
        validate: (d) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(d.pan || ''),
        message: 'Invalid PAN format. Expected: AAAAA9999A (5 letters + 4 digits + 1 letter)',
        section: 'Section 139A',
      },
      {
        id: 'P002', category: 'personal', subcategory: 'pan',
        description: 'PAN type entity check (4th character)',
        severity: 'warning',
        validate: (d) => {
          const validTypes = ['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G'];
          return !d.pan || validTypes.includes((d.pan || '')[3]);
        },
        message: 'PAN 4th character should be P(Person)/C(Company)/H(HUF)/F(Firm)/A(AOP)/T(Trust)',
      },
      {
        id: 'P003', category: 'personal', subcategory: 'aadhaar',
        description: 'Aadhaar format: 12 digits',
        severity: 'error',
        validate: (d) => !d.aadhaar || /^[0-9]{12}$/.test((d.aadhaar || '').replace(/\s/g, '')),
        message: 'Aadhaar must be 12 numeric digits',
        section: 'Section 139AA',
      },
      {
        id: 'P004', category: 'personal', subcategory: 'aadhaar',
        description: 'Aadhaar first digit not 0 or 1',
        severity: 'error',
        validate: (d) => !d.aadhaar || !['0', '1'].includes((d.aadhaar || '')[0]),
        message: 'Aadhaar number cannot start with 0 or 1',
      },
      {
        id: 'P005', category: 'personal', subcategory: 'mobile',
        description: 'Indian mobile number format',
        severity: 'error',
        validate: (d) => !d.mobile || /^[6-9]\d{9}$/.test(d.mobile),
        message: 'Mobile number must be 10 digits starting with 6-9',
      },
      {
        id: 'P006', category: 'personal', subcategory: 'email',
        description: 'Email format validation',
        severity: 'error',
        validate: (d) => !d.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email),
        message: 'Invalid email format',
      },
      {
        id: 'P007', category: 'personal', subcategory: 'dob',
        description: 'Date of Birth reasonable range',
        severity: 'error',
        validate: (d) => {
          if (!d.dob) return true;
          const dob = new Date(d.dob);
          const age = (new Date().getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365);
          return age >= 1 && age <= 120;
        },
        message: 'Date of Birth must result in age between 1 and 120 years',
      },
      {
        id: 'P008', category: 'personal', subcategory: 'dob',
        description: 'Senior citizen age check (60+)',
        severity: 'info',
        validate: (d) => true, // Info rule — always passes, adds info
        message: 'Taxpayer aged 60-80: Senior citizen benefits available (higher exemption limit ₹3L)',
        section: 'Section 2(26A)',
      },
      {
        id: 'P009', category: 'personal', subcategory: 'pan',
        description: 'PAN-Aadhaar linking mandatory',
        severity: 'warning',
        validate: (d) => !(d.pan && !d.aadhaarLinked),
        message: 'PAN-Aadhaar not linked. PAN may become inoperative. Fee: ₹1,000. Link on incometax.gov.in',
        section: 'Section 139AA',
      },
      {
        id: 'P010', category: 'personal', subcategory: 'address',
        description: 'Address required for ITR filing',
        severity: 'error',
        validate: (d) => !!(d.address && d.address.trim().length > 10),
        message: 'Complete address required for filing',
      },
      // Placeholder for additional 40+ personal rules
    ],

    // ── INCOME RULES ────────────────────────────────────────
    income: [
      {
        id: 'I001', category: 'income', subcategory: 'salary',
        description: 'Standard Deduction limit (New Regime FY 2025-26)',
        severity: 'error',
        validate: (d) => !d.standardDeduction || d.standardDeduction <= 75000,
        message: 'Standard Deduction cannot exceed ₹75,000 (New Regime FY 2025-26)',
        section: 'Section 16(ia)',
      },
      {
        id: 'I002', category: 'income', subcategory: 'salary',
        description: 'Standard Deduction Old Regime limit',
        severity: 'warning',
        validate: (d) => !d.standardDeductionOld || d.standardDeductionOld <= 50000,
        message: 'Standard Deduction (Old Regime) cannot exceed ₹50,000',
        section: 'Section 16(ia)',
      },
      {
        id: 'I003', category: 'income', subcategory: 'hra',
        description: 'HRA exemption calculation check',
        severity: 'warning',
        validate: (d) => {
          if (!d.hra || !d.salary) return true;
          const maxHra = Math.min(
            d.hra,
            d.salary * 0.5, // Metro: 50% of salary
            (d.rentPaid || 0) - d.salary * 0.1,
          );
          return (d.hraExemption || 0) <= maxHra * 1.02; // 2% tolerance
        },
        message: 'HRA exemption exceeds calculated maximum. Verify: Actual HRA vs 50%/40% salary vs Rent-10%salary',
        section: 'Section 10(13A)',
      },
      {
        id: 'I004', category: 'income', subcategory: 'house_property',
        description: 'House property loss set-off limit',
        severity: 'error',
        validate: (d) => !d.housePropertyLoss || d.housePropertyLoss <= 200000,
        message: 'House property loss set-off against salary limited to ₹2,00,000 per year',
        section: 'Section 71(3A)',
      },
      {
        id: 'I005', category: 'income', subcategory: 'house_property',
        description: 'Home loan interest deduction limit',
        severity: 'error',
        validate: (d) => !d.homeLoanInterest || d.homeLoanInterest <= 200000,
        message: 'Home loan interest (self-occupied) deduction limited to ₹2,00,000',
        section: 'Section 24(b)',
      },
      {
        id: 'I006', category: 'income', subcategory: 'capital_gain',
        description: 'STCG rate validation (Equity/ETF post July 2024)',
        severity: 'error',
        validate: (d) => !d.stcgEquity || d.stcgRate === 0.20,
        message: 'STCG on equity/ETF: 20% (post Budget 2024, effective July 23, 2024)',
        section: 'Section 111A',
      },
      {
        id: 'I007', category: 'income', subcategory: 'capital_gain',
        description: 'LTCG exemption limit (equity)',
        severity: 'info',
        validate: (d) => true,
        message: 'LTCG on equity: ₹1.25L exempt per year (post Budget 2024). Above that: 12.5% without indexation',
        section: 'Section 112A',
      },
      {
        id: 'I008', category: 'income', subcategory: 'business',
        description: 'Tax audit threshold for business income',
        severity: 'warning',
        validate: (d) => !d.businessTurnover || d.businessTurnover <= 10000000 || d.auditRequired,
        message: 'Business turnover > ₹1 Crore: Tax audit u/s 44AB is mandatory. Appoint CA.',
        section: 'Section 44AB',
      },
      {
        id: 'I009', category: 'income', subcategory: 'business',
        description: 'Presumptive tax threshold (44AD)',
        severity: 'info',
        validate: (d) => true,
        message: 'Business turnover ≤ ₹3 Crore (digital receipts) eligible for presumptive tax u/s 44AD at 6%/8%',
        section: 'Section 44AD',
      },
      {
        id: 'I010', category: 'income', subcategory: 'fno_crypto',
        description: 'F&O trading — treated as business income',
        severity: 'warning',
        validate: (d) => !(d.fnoIncome && !d.itrForm?.includes('3')),
        message: 'F&O trading income requires ITR-3 (not ITR-1/4). Audit required if turnover > ₹1Cr.',
        section: 'Section 43(5)',
      },
      {
        id: 'I011', category: 'income', subcategory: 'fno_crypto',
        description: 'Crypto VDA income: 30% flat tax',
        severity: 'error',
        validate: (d) => !d.cryptoIncome || d.cryptoTaxRate === 30,
        message: 'Virtual Digital Assets (Crypto/NFT): 30% flat tax + 4% cess. No deduction except cost of acquisition.',
        section: 'Section 115BBH',
      },
      {
        id: 'I012', category: 'income', subcategory: 'crypto',
        description: 'TDS on crypto transactions (1%)',
        severity: 'warning',
        validate: (d) => true,
        message: 'TDS @1% on crypto transactions > ₹10,000 per transaction (₹50,000 for specified persons)',
        section: 'Section 194S',
      },
      {
        id: 'I013', category: 'income', subcategory: 'foreign',
        description: 'Foreign income reporting mandatory',
        severity: 'error',
        validate: (d) => !(d.foreignIncome && !d.foreignIncomeReported),
        message: 'Foreign income (salary, dividends, capital gains) must be reported in ITR. Use Schedule FSI.',
        section: 'Section 5',
      },
      {
        id: 'I014', category: 'income', subcategory: 'exempt',
        description: 'Agricultural income reporting (if > ₹5000)',
        severity: 'warning',
        validate: (d) => !(d.agriculturalIncome > 5000 && !d.agriculturalIncomeReported),
        message: 'Agricultural income > ₹5,000: Must be reported (though exempt). Used for rate computation.',
        section: 'Section 10(1)',
      },
      {
        id: 'I015', category: 'income', subcategory: 'salary',
        description: 'Budget 2025: New Regime slab check — ₹12.75L = Zero Tax',
        severity: 'info',
        validate: (d) => true,
        message: 'Budget 2025: Gross salary ≤ ₹12,75,000 = ZERO TAX in New Regime (after ₹75K Std Deduction + ₹60K 87A rebate)',
        section: 'Section 87A + New Regime Slabs',
      },
      // Placeholder for additional 85+ income rules
    ],

    // ── DEDUCTION RULES ─────────────────────────────────────
    deductions: [
      {
        id: 'D001', category: 'deductions', subcategory: '80C',
        description: '80C total limit',
        severity: 'error',
        validate: (d) => !d.deduction80C || d.deduction80C <= 150000,
        message: 'Total 80C deductions cannot exceed ₹1,50,000',
        section: 'Section 80C',
      },
      {
        id: 'D002', category: 'deductions', subcategory: '80C',
        description: '80C not available in New Regime',
        severity: 'error',
        validate: (d) => !(d.regime === 'NEW' && d.deduction80C > 0),
        message: '80C deductions NOT available in New Tax Regime. Switch to Old Regime or remove claim.',
        section: 'Section 115BAC',
      },
      {
        id: 'D003', category: 'deductions', subcategory: '80D',
        description: '80D health insurance self limit',
        severity: 'error',
        validate: (d) => !d.deduction80D_self || d.deduction80D_self <= 25000,
        message: 'Health insurance premium (self/spouse/children) limited to ₹25,000 (₹50,000 for senior citizen)',
        section: 'Section 80D',
      },
      {
        id: 'D004', category: 'deductions', subcategory: '80D',
        description: '80D parents limit',
        severity: 'error',
        validate: (d) => !d.deduction80D_parents || d.deduction80D_parents <= 50000,
        message: 'Health insurance for parents: ₹25,000 (₹50,000 if parents are senior citizens)',
        section: 'Section 80D',
      },
      {
        id: 'D005', category: 'deductions', subcategory: '80CCD',
        description: '80CCD(1B) NPS additional deduction',
        severity: 'error',
        validate: (d) => !d.deduction80CCD_1B || d.deduction80CCD_1B <= 50000,
        message: 'NPS additional deduction u/s 80CCD(1B) limited to ₹50,000 (over and above 80C)',
        section: 'Section 80CCD(1B)',
      },
      {
        id: 'D006', category: 'deductions', subcategory: '80G',
        description: '80G donation verification',
        severity: 'warning',
        validate: (d) => !(d.deduction80G && !d.donation80GVerified),
        message: '80G donations must be verified on IT Portal. Keep donation receipt with 80G registration number.',
        section: 'Section 80G',
      },
      {
        id: 'D007', category: 'deductions', subcategory: '80TTA',
        description: '80TTA savings interest limit',
        severity: 'error',
        validate: (d) => !d.deduction80TTA || d.deduction80TTA <= 10000,
        message: 'Savings account interest deduction (80TTA) limited to ₹10,000',
        section: 'Section 80TTA',
      },
      {
        id: 'D008', category: 'deductions', subcategory: '80TTB',
        description: '80TTB senior citizen interest limit',
        severity: 'error',
        validate: (d) => !d.deduction80TTB || d.deduction80TTB <= 50000,
        message: 'Senior citizen (60+) interest income deduction (80TTB) limited to ₹50,000',
        section: 'Section 80TTB',
      },
      {
        id: 'D009', category: 'deductions', subcategory: '80EEA',
        description: '80EEA affordable housing interest',
        severity: 'error',
        validate: (d) => !d.deduction80EEA || d.deduction80EEA <= 150000,
        message: '80EEA additional home loan interest limited to ₹1,50,000 (stamp value ≤ ₹45L)',
        section: 'Section 80EEA',
      },
      {
        id: 'D010', category: 'deductions', subcategory: '80E',
        description: '80E education loan interest — no limit',
        severity: 'info',
        validate: (d) => true,
        message: '80E education loan interest: No ceiling, deductible for 8 years from start of repayment',
        section: 'Section 80E',
      },
      {
        id: 'D011', category: 'deductions', subcategory: 'new_regime',
        description: 'Deductions not available in New Regime',
        severity: 'error',
        validate: (d) => {
          if (d.regime !== 'NEW') return true;
          const newRegimeBlocked = ['deduction80C', 'deduction80D', 'deduction80G', 'deduction80TTA', 'deduction80E', 'hraExemption', 'lta', 'homeLoanInterest'];
          return !newRegimeBlocked.some(key => d[key] > 0);
        },
        message: 'New Regime: Most Chapter VI-A deductions (80C/80D/80G/HRA/LTA etc.) are NOT available',
        section: 'Section 115BAC',
      },
      {
        id: 'D012', category: 'deductions', subcategory: 'new_regime',
        description: 'New Regime deductions still available',
        severity: 'info',
        validate: (d) => true,
        message: 'New Regime: Standard Deduction ₹75K, 80CCD(2) employer NPS, 80CCH Agniveer, 80JJAA, 80LA still available',
        section: 'Section 115BAC(2)',
      },
      {
        id: 'D013', category: 'deductions', subcategory: '80C',
        description: '80CCC pension plan sub-limit',
        severity: 'error',
        validate: (d) => !d.deduction80CCC || d.deduction80CCC <= 150000,
        message: '80CCC pension plan premium within 80C limit of ₹1,50,000',
        section: 'Section 80CCC',
      },
      {
        id: 'D014', category: 'deductions', subcategory: '80GG',
        description: '80GG rent deduction for non-HRA earners',
        severity: 'info',
        validate: (d) => !(d.deduction80GG && d.hra > 0),
        message: '80GG available only if HRA is NOT part of salary. Cannot claim both 80GG and HRA exemption.',
        section: 'Section 80GG',
      },
      {
        id: 'D015', category: 'deductions', subcategory: '80U',
        description: '80U disability deduction',
        severity: 'info',
        validate: (d) => true,
        message: '80U: ₹75,000 (disability) or ₹1,25,000 (severe disability ≥80%). Certificate required from medical authority.',
        section: 'Section 80U',
      },
      // Placeholder for additional 85+ deduction rules
    ],

    // ── GST RULES ───────────────────────────────────────────
    gst: [
      {
        id: 'G001', category: 'gst', subcategory: 'gstin',
        description: 'GSTIN format validation',
        severity: 'error',
        validate: (d) => !d.gstin || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][Z][0-9A-Z]$/.test(d.gstin),
        message: 'Invalid GSTIN format. Expected: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric',
      },
      {
        id: 'G002', category: 'gst', subcategory: 'gstin',
        description: 'GSTIN state code validation',
        severity: 'error',
        validate: (d) => {
          if (!d.gstin) return true;
          const stateCode = parseInt(d.gstin.slice(0, 2));
          return stateCode >= 1 && stateCode <= 37;
        },
        message: 'GSTIN state code (first 2 digits) must be between 01-37 (valid Indian state codes)',
      },
      {
        id: 'G003', category: 'gst', subcategory: 'invoice',
        description: 'Invoice mandatory fields',
        severity: 'error',
        validate: (d) => {
          if (!d.invoice) return true;
          const required = ['supplierGSTIN', 'invoiceNo', 'invoiceDate', 'hsnCode', 'value', 'taxableValue'];
          return required.every(f => d.invoice[f]);
        },
        message: 'Invoice missing mandatory fields: GSTIN, Invoice No, Date, HSN, Value, Taxable Value',
        section: 'Rule 46, CGST Rules',
      },
      {
        id: 'G004', category: 'gst', subcategory: 'hsn',
        description: 'HSN code length',
        severity: 'error',
        validate: (d) => !d.hsnCode || [4, 6, 8].includes(String(d.hsnCode).length),
        message: 'HSN code must be 4, 6, or 8 digits (8 digits mandatory for turnover > ₹5 Crore)',
        section: 'Notification 78/2020-CT',
      },
      {
        id: 'G005', category: 'gst', subcategory: 'itc',
        description: 'ITC reconciliation tolerance',
        severity: 'warning',
        validate: (d) => {
          if (!d.itcClaimed || !d.itcAsPerGSTR2B) return true;
          const diff = Math.abs(d.itcClaimed - d.itcAsPerGSTR2B) / d.itcAsPerGSTR2B;
          return diff <= 0.01; // 1% tolerance
        },
        message: 'ITC claimed differs from GSTR-2B by more than 1%. Risk of notice u/s 61. Reconcile immediately.',
        section: 'Section 16(2)(aa)',
      },
      {
        id: 'G006', category: 'gst', subcategory: 'itc',
        description: 'ITC blocked credits check',
        severity: 'error',
        validate: (d) => !(d.itcOnPersonalExpenses > 0),
        message: 'ITC on personal expenses (food, beauty, membership, rent of personal dwelling) is BLOCKED',
        section: 'Section 17(5)',
      },
      {
        id: 'G007', category: 'gst', subcategory: 'reverse_charge',
        description: 'Reverse Charge Mechanism (RCM) check',
        severity: 'warning',
        validate: (d) => !(d.rcmSupplies && !d.rcmLiabilityPaid),
        message: 'RCM applicable on GTA, Legal Services, Import of Services. Self-invoice required. Pay tax & claim ITC same period.',
        section: 'Section 9(3) / 9(4)',
      },
      {
        id: 'G008', category: 'gst', subcategory: 'gstr',
        description: 'GSTR-1 filing before GSTR-3B',
        severity: 'error',
        validate: (d) => !(d.gstr3bFiled && !d.gstr1Filed),
        message: 'GSTR-1 should be filed before or same time as GSTR-3B for the period',
        section: 'Section 37 & 39',
      },
      {
        id: 'G009', category: 'gst', subcategory: 'late_fee',
        description: 'GSTR-3B late filing fee',
        severity: 'info',
        validate: (d) => true,
        message: 'GSTR-3B late filing: ₹50/day (CGST ₹25 + SGST ₹25). Nil return: ₹20/day. Maximum ₹10,000.',
        section: 'Section 47',
      },
      {
        id: 'G010', category: 'gst', subcategory: 'composition',
        description: 'Composition scheme eligibility',
        severity: 'warning',
        validate: (d) => !(d.compositionScheme && (d.annualTurnover > 15000000 || d.interStateSales)),
        message: 'Composition scheme: Turnover must be < ₹1.5 Crore. No inter-state supplies allowed.',
        section: 'Section 10',
      },
      // Placeholder for additional 90+ GST rules
    ],

    // ── BANKING RULES ────────────────────────────────────────
    banking: [
      {
        id: 'B001', category: 'banking', subcategory: 'ifsc',
        description: 'IFSC code format',
        severity: 'error',
        validate: (d) => !d.ifsc || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(d.ifsc),
        message: 'Invalid IFSC code. Format: 4 letters + 0 + 6 alphanumeric (e.g., SBIN0001234)',
      },
      {
        id: 'B002', category: 'banking', subcategory: 'account',
        description: 'Account number length',
        severity: 'error',
        validate: (d) => !d.accountNumber || (String(d.accountNumber).length >= 9 && String(d.accountNumber).length <= 18),
        message: 'Bank account number must be 9-18 digits',
      },
      {
        id: 'B003', category: 'banking', subcategory: 'refund',
        description: 'Refund account must be pre-validated',
        severity: 'error',
        validate: (d) => !(d.refundBankAccount && !d.bankAccountPrevalidated),
        message: 'Refund bank account must be pre-validated on IT Portal before filing',
        section: 'ITR filing requirement',
      },
      {
        id: 'B004', category: 'banking', subcategory: 'account',
        description: 'Account type for refund',
        severity: 'warning',
        validate: (d) => !d.accountType || ['SB', 'CA', 'CC', 'NRE', 'NRO'].includes(d.accountType),
        message: 'Account type must be SB (Savings), CA (Current), CC, NRE, or NRO',
      },
      {
        id: 'B005', category: 'banking', subcategory: 'tds',
        description: 'High cash deposit SFT reporting',
        severity: 'warning',
        validate: (d) => !(d.cashDeposit > 1000000),
        message: 'Cash deposit > ₹10 Lakh reported in AIS via SFT. Verify with bank statement.',
        section: 'Rule 114E',
      },
      // Placeholder for additional 45+ banking rules
    ],

    // ── FILING RULES ─────────────────────────────────────────
    filing: [
      {
        id: 'F001', category: 'filing', subcategory: 'form_eligibility',
        description: 'ITR-1 eligibility: No business income',
        severity: 'error',
        validate: (d) => !(d.formType === 'ITR-1' && d.businessIncome > 0),
        message: 'ITR-1 not eligible if business/profession income exists. Use ITR-3 or ITR-4.',
      },
      {
        id: 'F002', category: 'filing', subcategory: 'form_eligibility',
        description: 'ITR-1 eligibility: Income limit ₹50L',
        severity: 'error',
        validate: (d) => !(d.formType === 'ITR-1' && d.totalIncome > 5000000),
        message: 'ITR-1: Total income cannot exceed ₹50,00,000. Use ITR-2.',
      },
      {
        id: 'F003', category: 'filing', subcategory: 'form_eligibility',
        description: 'ITR-4 presumptive: Turnover limit',
        severity: 'error',
        validate: (d) => !(d.formType === 'ITR-4' && d.businessTurnover > 300000000),
        message: 'ITR-4: Turnover cannot exceed ₹3 Crore (digital) or ₹2 Crore (otherwise) for 44AD',
        section: 'Section 44AD',
      },
      {
        id: 'F004', category: 'filing', subcategory: 'mandatory',
        description: 'PAN mandatory for filing',
        severity: 'error',
        validate: (d) => !!(d.pan),
        message: 'PAN is mandatory for filing ITR',
        section: 'Section 139',
      },
      {
        id: 'F005', category: 'filing', subcategory: 'mandatory',
        description: 'Bank account details mandatory',
        severity: 'error',
        validate: (d) => !!(d.bankAccount && d.ifsc),
        message: 'Bank account details (Account No + IFSC) mandatory for refund',
      },
      {
        id: 'F006', category: 'filing', subcategory: 'duplicate',
        description: 'Duplicate filing check (same PAN + AY)',
        severity: 'error',
        validate: (d) => !d.duplicateFiling,
        message: 'A filing already exists for this PAN and Assessment Year. Use Revised Return u/s 139(5) if correction needed.',
        section: 'Section 139(5)',
      },
      {
        id: 'F007', category: 'filing', subcategory: 'tax_computation',
        description: 'Tax payable cross-check',
        severity: 'error',
        validate: (d) => {
          if (!d.computedTax || !d.declaredTax) return true;
          const diff = Math.abs(d.computedTax - d.declaredTax) / d.computedTax;
          return diff <= 0.001; // 0.1% tolerance
        },
        message: 'Tax computation cross-check failed. Computed tax differs from declared tax by more than 0.1%.',
      },
      {
        id: 'F008', category: 'filing', subcategory: 'advance_tax',
        description: 'Advance tax liability check',
        severity: 'warning',
        validate: (d) => {
          if (!d.taxLiability || d.taxLiability <= 10000) return true;
          return d.advanceTaxPaid > 0;
        },
        message: 'Tax liability > ₹10,000: Advance tax should have been paid. Interest u/s 234B/234C may apply.',
        section: 'Section 208 / 234B / 234C',
      },
      {
        id: 'F009', category: 'filing', subcategory: 'filing_date',
        description: 'ITR due date check (individual)',
        severity: 'warning',
        validate: (d) => {
          const today = new Date();
          // AY 2026-27: Due date July 31, 2026
          const dueDate = new Date('2026-07-31');
          return today <= dueDate;
        },
        message: 'Filing after July 31 attracts late filing fee u/s 234F (₹1,000 if income ≤ ₹5L; else ₹5,000)',
        section: 'Section 234F',
      },
      {
        id: 'F010', category: 'filing', subcategory: 'verification',
        description: 'E-verification mandatory within 30 days',
        severity: 'error',
        validate: (d) => !(d.filed && !d.verified && d.daysSinceFiling > 30),
        message: 'ITR must be e-verified within 30 days of filing. Unverified returns are invalid.',
        section: 'Rule 12(1)',
      },
      {
        id: 'F011', category: 'filing', subcategory: 'ais_mismatch',
        description: 'AIS/26AS mismatch detection',
        severity: 'error',
        validate: (d) => !(d.aisMismatch && d.aisMismatchAmount > 1000),
        message: 'AIS/26AS mismatch detected. Discrepancy must be addressed before filing to avoid scrutiny notice.',
        section: 'Section 143(1)',
      },
      {
        id: 'F012', category: 'filing', subcategory: 'schedule',
        description: 'Foreign asset Schedule FA mandatory',
        severity: 'error',
        validate: (d) => !(d.foreignAssets && !d.scheduleFAFilled),
        message: 'Foreign assets/accounts: Schedule FA mandatory in ITR (use ITR-2 or ITR-3)',
        section: 'Section 139(1) — Black Money Act',
      },
      // Placeholder for additional 88+ filing rules
    ],
  };

  // ── Public Methods ────────────────────────────────────────

  getCategories(): Array<{ id: string; count: number; description: string; ruleIds: string[] }> {
    return this.categories.map((c) => ({
      id: c,
      count: this.rules[c]?.length || 0,
      description: this.getCategoryDescription(c),
      ruleIds: (this.rules[c] || []).map(r => r.id),
    }));
  }

  getRule(ruleId: string): ValidationRule | undefined {
    for (const cat of this.categories) {
      const rule = this.rules[cat]?.find(r => r.id === ruleId);
      if (rule) return rule;
    }
    return undefined;
  }

  runFullValidation(category: string, data: any): ValidationResult {
    const start = Date.now();

    if (!this.categories.includes(category)) {
      return {
        category,
        valid: false,
        totalRules: 0,
        passed: 0,
        failed: 1,
        warnings: 0,
        errors: [{ ruleId: 'SYS001', field: 'category', message: `Unknown category: ${category}. Valid: ${this.categories.join(', ')}`, severity: 'error' }],
        warnings_list: [],
        dataSnapshot: this.maskSensitive(data),
        timestamp: new Date().toISOString(),
        executionMs: Date.now() - start,
      };
    }

    const categoryRules = this.rules[category] || [];
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let passed = 0;

    for (const rule of categoryRules) {
      try {
        const result = rule.validate(data);
        if (result) {
          passed++;
        } else {
          if (rule.severity === 'error') {
            errors.push({
              ruleId: rule.id,
              field: rule.subcategory,
              message: rule.message,
              severity: 'error',
              section: rule.section,
              suggestedFix: this.getSuggestedFix(rule.id),
            });
          } else if (rule.severity === 'warning') {
            warnings.push({
              ruleId: rule.id,
              message: rule.message,
              section: rule.section,
            });
          }
        }
      } catch (e) {
        this.logger.warn(`Rule ${rule.id} execution error: ${e}`);
      }
    }

    const result: ValidationResult = {
      category,
      valid: errors.length === 0,
      totalRules: categoryRules.length,
      passed,
      failed: errors.length,
      warnings: warnings.length,
      errors,
      warnings_list: warnings,
      dataSnapshot: this.maskSensitive(data),
      timestamp: new Date().toISOString(),
      executionMs: Date.now() - start,
    };

    this.logger.log(`Validation [${category}]: ${passed}/${categoryRules.length} passed, ${errors.length} errors, ${warnings.length} warnings`);
    return result;
  }

  runAllCategories(data: any): Record<string, ValidationResult> {
    const results: Record<string, ValidationResult> = {};
    for (const cat of this.categories) {
      results[cat] = this.runFullValidation(cat, data);
    }
    return results;
  }

  // ── Private Helpers ──────────────────────────────────────

  private getCategoryDescription(c: string): string {
    const map: Record<string, string> = {
      personal: 'PAN / Aadhaar / DOB / Mobile / Email validation (10 rules)',
      income: 'Salary / HRA / House Property / Capital Gain / Business / F&O / Crypto / Foreign Income (15 rules)',
      deductions: '80C / 80D / 80CCD / 80G / 80TTA / 80TTB / 80EEA / 80E / 80GG / 80U (15 rules)',
      gst: 'GSTIN / Invoice / HSN / ITC / RCM / Reconciliation / Composition (10 rules)',
      banking: 'IFSC / Account / Refund / SFT / Pre-validation (5 rules)',
      filing: 'ITR Form Eligibility / Mandatory Fields / Advance Tax / Due Date / AIS Mismatch / FA Schedule (12 rules)',
    };
    return map[c] || 'Enterprise rule block';
  }

  private getSuggestedFix(ruleId: string): string {
    const fixes: Record<string, string> = {
      'P001': 'Correct PAN format: 5 capital letters + 4 digits + 1 capital letter',
      'P003': 'Enter 12-digit Aadhaar without spaces',
      'I004': 'Carry forward excess house property loss to next year',
      'D002': 'Switch to Old Regime or remove 80C claim',
      'G001': 'Verify GSTIN on gst.gov.in taxpayer search',
      'F002': 'Use ITR-2 for income exceeding ₹50 Lakh',
    };
    return fixes[ruleId] || 'Review and correct the field as per IT Act provisions';
  }

  private maskSensitive(data: any): any {
    if (!data) return {};
    const masked = { ...data };
    // Enterprise Security: mask PAN / Aadhaar / Account in logs (AES-256 in production)
    if (masked.pan) masked.pan = masked.pan.slice(0, 2) + '****' + masked.pan.slice(-3);
    if (masked.aadhaar) masked.aadhaar = '****-****-' + String(masked.aadhaar).slice(-4);
    if (masked.accountNumber) masked.accountNumber = '****' + String(masked.accountNumber).slice(-4);
    if (masked.mobile) masked.mobile = masked.mobile.slice(0, 2) + '****' + masked.mobile.slice(-2);
    return masked;
  }
}
