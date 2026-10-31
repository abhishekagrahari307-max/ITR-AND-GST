import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ValidationEngineService } from '../validation/validation-engine.service';

/**
 * TaxMitra Enterprise — Tax File Service
 * Developer: Abhishek Agrahari
 *
 * Phase 1: In-memory store (replace with Prisma + PostgreSQL in Phase 4)
 * Phase 4: Full Prisma ORM + Redis cache + Audit Log + Portal API integration
 */

export interface TaxFile {
  id: string;
  userId: string;
  clientId?: string;
  assessmentYear: string;
  formType: string;
  regime: 'OLD' | 'NEW';
  status: 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'PAID' | 'REFUND_PENDING' | 'NOTICE_ISSUED' | 'COMPLETE';
  jsonData: any;
  computedTax?: number;
  refundDue?: number;
  portalAck?: string;
  validationReport?: any;
  auditLog?: any[];
  createdAt: string;
  updatedAt: string;
}

// Phase 1: In-memory store (seeded with demo data)
// Phase 4: Replace with: private prisma = new PrismaClient();
const DB: Map<string, TaxFile> = new Map();

// Demo seed data
DB.set('tf-demo-001', {
  id: 'tf-demo-001',
  userId: 'u-admin',
  clientId: 'c-demo-001',
  assessmentYear: 'AY-2026-27',
  formType: 'ITR-1',
  regime: 'NEW',
  status: 'DRAFT',
  jsonData: {
    personalInfo: { name: 'Demo Taxpayer', pan: 'ABCDE1234F', dob: '1990-01-01', mobile: '9876543210', email: 'demo@taxmitra.in' },
    incomeDetails: { salary: 1200000, standardDeduction: 75000 },
    deductions: { u80C: 0 }, // New regime: no 80C
    bankDetails: { accountNumber: '123456789012', ifsc: 'SBIN0001234', accountType: 'SB' },
  },
  computedTax: 30000, // After 87A rebate on ₹12L income
  refundDue: 0,
  auditLog: [{ action: 'CREATED', timestamp: new Date().toISOString(), by: 'system' }],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

@Injectable()
export class TaxFileService {
  private readonly logger = new Logger(TaxFileService.name);

  constructor(private readonly validationEngine: ValidationEngineService) {}

  async create(dto: any): Promise<{ file: TaxFile; validation: any }> {
    if (!dto.userId) throw new BadRequestException('userId is required');
    if (!dto.formType) throw new BadRequestException('formType is required (ITR-1 to ITR-7)');

    const id = `tf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const file: TaxFile = {
      id,
      userId: dto.userId,
      clientId: dto.clientId || undefined,
      assessmentYear: dto.assessmentYear || 'AY-2026-27',
      formType: dto.formType,
      regime: dto.regime || 'NEW',
      status: 'DRAFT',
      jsonData: dto.jsonData || {},
      computedTax: dto.computedTax || undefined,
      refundDue: dto.refundDue || undefined,
      auditLog: [{ action: 'CREATED', timestamp: now, by: dto.userId }],
      createdAt: now,
      updatedAt: now,
    };

    // Run filing validation immediately
    const validationData = {
      formType: file.formType,
      pan: file.jsonData?.personalInfo?.pan,
      totalIncome: file.computedTax,
      ...file.jsonData,
    };
    const validation = this.validationEngine.runFullValidation('filing', validationData);
    file.validationReport = validation;

    DB.set(id, file);
    this.logger.log(`TaxFile created: ${id} | ${file.formType} | ${file.assessmentYear}`);

    return { file, validation };
  }

  async findAll(query: any): Promise<TaxFile[]> {
    let results = Array.from(DB.values());

    if (query.userId) results = results.filter(f => f.userId === query.userId);
    if (query.status) results = results.filter(f => f.status === query.status);
    if (query.ay) results = results.filter(f => f.assessmentYear === query.ay);
    if (query.formType) results = results.filter(f => f.formType === query.formType);

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async findOne(id: string): Promise<TaxFile> {
    const file = DB.get(id);
    if (!file) throw new NotFoundException(`TaxFile ${id} not found`);
    return file;
  }

  async update(id: string, dto: any): Promise<TaxFile> {
    const file = await this.findOne(id);

    if (dto.status === 'SUBMITTED' && file.status === 'COMPLETE') {
      throw new BadRequestException('Cannot re-submit a completed filing');
    }

    const updated: TaxFile = {
      ...file,
      ...dto,
      id: file.id, // Prevent ID override
      updatedAt: new Date().toISOString(),
      auditLog: [
        ...(file.auditLog || []),
        {
          action: `STATUS_CHANGED: ${file.status} → ${dto.status || file.status}`,
          timestamp: new Date().toISOString(),
          by: dto.updatedBy || 'user',
          changes: Object.keys(dto).filter(k => k !== 'updatedBy'),
        },
      ],
    };

    DB.set(id, updated);
    this.logger.log(`TaxFile updated: ${id} | Status: ${updated.status}`);
    return updated;
  }

  async remove(id: string): Promise<{ deleted: boolean; id: string }> {
    const file = await this.findOne(id);
    if (file.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT filings can be deleted');
    }
    DB.delete(id);
    this.logger.log(`TaxFile deleted: ${id}`);
    return { deleted: true, id };
  }

  async validateFile(id: string): Promise<{ filing: any; personal: any; income: any; deductions: any; banking: any }> {
    const file = await this.findOne(id);
    const data = {
      formType: file.formType,
      regime: file.regime,
      ...file.jsonData?.personalInfo,
      ...file.jsonData?.incomeDetails,
      ...file.jsonData?.deductions,
      ...file.jsonData?.bankDetails,
    };

    const results = {
      filing: this.validationEngine.runFullValidation('filing', { ...data, formType: file.formType }),
      personal: this.validationEngine.runFullValidation('personal', data),
      income: this.validationEngine.runFullValidation('income', data),
      deductions: this.validationEngine.runFullValidation('deductions', { ...data, regime: file.regime }),
      banking: this.validationEngine.runFullValidation('banking', data),
    };

    // Update file with latest validation
    const updated = { ...file, validationReport: results, updatedAt: new Date().toISOString() };
    DB.set(id, updated);

    return results;
  }

  async computeTax(id: string): Promise<{ file: TaxFile; computation: any }> {
    const file = await this.findOne(id);
    const income = file.jsonData?.incomeDetails?.salary || 0;
    const deductions = file.regime === 'OLD' ? (file.jsonData?.deductions?.u80C || 0) : 0;

    const computation = this.quickCompute(income, file.regime, deductions);

    const updated = await this.update(id, {
      computedTax: computation.taxAfterRebate,
      refundDue: Math.max(0, (file.jsonData?.tdsDeducted || 0) - computation.taxAfterRebate),
    });

    return { file: updated, computation };
  }

  quickCompute(income: number, regime: 'OLD' | 'NEW' = 'NEW', deductions = 0): any {
    // Budget 2025 — AY 2026-27 Slabs
    const newSlabs = [
      { from: 0, to: 400000, rate: 0 },
      { from: 400000, to: 800000, rate: 0.05 },
      { from: 800000, to: 1200000, rate: 0.10 },
      { from: 1200000, to: 1600000, rate: 0.15 },
      { from: 1600000, to: 2000000, rate: 0.20 },
      { from: 2000000, to: 2400000, rate: 0.25 },
      { from: 2400000, to: Infinity, rate: 0.30 },
    ];

    const oldSlabs = [
      { from: 0, to: 250000, rate: 0 },
      { from: 250000, to: 500000, rate: 0.05 },
      { from: 500000, to: 1000000, rate: 0.20 },
      { from: 1000000, to: Infinity, rate: 0.30 },
    ];

    const stdDeduction = regime === 'NEW' ? 75000 : 50000;
    const netIncome = Math.max(0, income - stdDeduction - (regime === 'OLD' ? deductions : 0));
    const slabs = regime === 'NEW' ? newSlabs : oldSlabs;

    let tax = 0;
    for (const slab of slabs) {
      if (netIncome <= slab.from) break;
      const taxable = Math.min(netIncome, slab.to) - slab.from;
      tax += taxable * slab.rate;
    }
    tax = Math.round(tax);

    // 87A Rebate: New Regime ≤ ₹12L → ₹60,000 | Old Regime ≤ ₹5L → ₹12,500
    let rebate87A = 0;
    if (regime === 'NEW' && netIncome <= 1200000) rebate87A = Math.min(tax, 60000);
    else if (regime === 'OLD' && netIncome <= 500000) rebate87A = Math.min(tax, 12500);

    const taxAfterRebate = Math.max(0, tax - rebate87A);

    // Surcharge
    let surcharge = 0;
    if (netIncome > 5000000 && netIncome <= 10000000) surcharge = taxAfterRebate * 0.10;
    else if (netIncome > 10000000 && netIncome <= 20000000) surcharge = taxAfterRebate * 0.15;
    else if (netIncome > 20000000 && netIncome <= 50000000) surcharge = taxAfterRebate * 0.25;
    else if (netIncome > 50000000) surcharge = taxAfterRebate * (regime === 'NEW' ? 0.25 : 0.37);

    const cess = (taxAfterRebate + surcharge) * 0.04;
    const totalTax = Math.round(taxAfterRebate + surcharge + cess);

    return {
      grossIncome: income,
      stdDeduction,
      deductions: regime === 'OLD' ? deductions : 0,
      netTaxableIncome: netIncome,
      regime,
      slabTax: tax,
      rebate87A,
      taxAfterRebate,
      surcharge: Math.round(surcharge),
      cess: Math.round(cess),
      totalTax,
      effectiveRate: income > 0 ? ((totalTax / income) * 100).toFixed(2) + '%' : '0%',
      zeroTax: totalTax === 0,
      note: totalTax === 0 && regime === 'NEW' && income <= 1275000
        ? '🎉 ZERO TAX! Budget 2025: Gross salary ≤ ₹12,75,000 = ₹0 tax in New Regime'
        : 'Computation as per Budget 2025 AY 2026-27',
    };
  }
}
