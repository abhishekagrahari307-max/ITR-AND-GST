import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';

/**
 * TaxMitra Enterprise — GST Return Service
 * Developer: Abhishek Agrahari
 *
 * Phase 1: In-memory store with business logic
 * Phase 4: Prisma + PostgreSQL + GSTN API integration + Redis cache
 */

export interface GSTReturn {
  id: string;
  userId: string;
  gstin: string;
  returnType: 'GSTR-1' | 'GSTR-3B' | 'GSTR-9' | 'GSTR-9C';
  period: string; // YYYY-MM
  status: 'DRAFT' | 'SUBMITTED' | 'COMPLETE';
  jsonData: any;
  filedDate?: string;
  gstnAck?: string;
  createdAt: string;
  updatedAt: string;
}

// HSN Rate database (simplified — Phase 4: full 12,000+ HSN codes from DB)
const HSN_RATES: Record<string, { description: string; rate: number; cess?: number }> = {
  '1001': { description: 'Wheat and meslin', rate: 0 },
  '2106': { description: 'Food preparations (processed food)', rate: 18 },
  '3004': { description: 'Medicaments', rate: 12 },
  '8471': { description: 'Computers and peripherals', rate: 18 },
  '8517': { description: 'Mobile phones', rate: 18 },
  '8703': { description: 'Motor cars', rate: 28, cess: 3 },
  '9401': { description: 'Seats and furniture', rate: 18 },
  '9801': { description: 'Project imports', rate: 12 },
  '6101': { description: 'Overcoats and garments', rate: 12 },
  '0401': { description: 'Milk and cream', rate: 0 },
  '2201': { description: 'Waters, including mineral waters', rate: 18 },
  '4901': { description: 'Printed books', rate: 0 },
};

const SAC_RATES: Record<string, { description: string; rate: number }> = {
  '9983': { description: 'IT services and development', rate: 18 },
  '9984': { description: 'Telecom and broadcasting services', rate: 18 },
  '9985': { description: 'Support services', rate: 18 },
  '9963': { description: 'Accommodation services', rate: 18 },
  '9971': { description: 'Financial and banking services', rate: 18 },
  '9972': { description: 'Real estate services', rate: 18 },
  '9973': { description: 'Leasing or rental services', rate: 18 },
  '9993': { description: 'Education services', rate: 0 },
  '9991': { description: 'Government services', rate: 0 },
};

// Phase 1: In-memory store
const DB: Map<string, GSTReturn> = new Map();

// Seed demo data
DB.set('gst-demo-001', {
  id: 'gst-demo-001',
  userId: 'u-admin',
  gstin: '09ABCDE1234F1Z5',
  returnType: 'GSTR-3B',
  period: '2025-07',
  status: 'DRAFT',
  jsonData: {
    outwardSupplies: { taxable: 500000, igst: 45000, cgst: 22500, sgst: 22500 },
    itcAvailable: { igst: 20000, cgst: 10000, sgst: 10000 },
    taxPayable: { igst: 25000, cgst: 12500, sgst: 12500 },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

@Injectable()
export class GstReturnService {
  private readonly logger = new Logger(GstReturnService.name);

  async create(dto: any): Promise<GSTReturn> {
    if (!dto.gstin) throw new BadRequestException('GSTIN is required');
    if (!dto.returnType) throw new BadRequestException('returnType is required (GSTR-1/3B/9/9C)');

    // Validate GSTIN format
    const gstinValidation = this.validateGSTIN(dto.gstin);
    if (!gstinValidation.valid) {
      throw new BadRequestException(`Invalid GSTIN: ${gstinValidation.errors.join(', ')}`);
    }

    const id = `gst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const record: GSTReturn = {
      id,
      userId: dto.userId || 'u-unknown',
      gstin: dto.gstin.toUpperCase(),
      returnType: dto.returnType,
      period: dto.period || new Date().toISOString().slice(0, 7),
      status: 'DRAFT',
      jsonData: dto.jsonData || {},
      createdAt: now,
      updatedAt: now,
    };

    DB.set(id, record);
    this.logger.log(`GST Return created: ${id} | ${record.returnType} | ${record.period}`);
    return record;
  }

  async findAll(query: any): Promise<GSTReturn[]> {
    let results = Array.from(DB.values());
    if (query.userId) results = results.filter(r => r.userId === query.userId);
    if (query.gstin) results = results.filter(r => r.gstin === query.gstin.toUpperCase());
    if (query.type) results = results.filter(r => r.returnType === query.type);
    if (query.period) results = results.filter(r => r.period === query.period);
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async findOne(id: string): Promise<GSTReturn & { itcReconciliation?: any }> {
    const record = DB.get(id);
    if (!record) throw new NotFoundException(`GST Return ${id} not found`);

    // Attach ITC reconciliation summary
    const itcReconciliation = this.calculateITC({
      totalItcAvailable: record.jsonData?.itcAvailable?.igst + record.jsonData?.itcAvailable?.cgst + record.jsonData?.itcAvailable?.sgst || 0,
      itcClaimed: record.jsonData?.itcAvailable?.igst + record.jsonData?.itcAvailable?.cgst + record.jsonData?.itcAvailable?.sgst || 0,
    });

    return { ...record, itcReconciliation };
  }

  async update(id: string, dto: any): Promise<GSTReturn> {
    const record = await this.findOne(id);
    const updated: GSTReturn = {
      ...record,
      ...dto,
      id: record.id,
      updatedAt: new Date().toISOString(),
    };
    DB.set(id, updated);
    this.logger.log(`GST Return updated: ${id} | Status: ${updated.status}`);
    return updated;
  }

  async remove(id: string): Promise<{ deleted: boolean; id: string }> {
    const record = await this.findOne(id);
    if (record.status !== 'DRAFT') throw new BadRequestException('Only DRAFT returns can be deleted');
    DB.delete(id);
    return { deleted: true, id };
  }

  validateGSTIN(gstin: string): { valid: boolean; errors: string[]; details?: any } {
    if (!gstin) return { valid: false, errors: ['GSTIN is required'] };
    const g = gstin.toUpperCase().trim();

    const errors: string[] = [];

    if (g.length !== 15) errors.push(`GSTIN must be 15 characters, got ${g.length}`);

    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][Z][0-9A-Z]$/;
    if (!gstinRegex.test(g)) errors.push('GSTIN format invalid (expected: 2digits+5letters+4digits+1letter+1alphanum+Z+1alphanum)');

    const stateCode = parseInt(g.slice(0, 2));
    if (stateCode < 1 || stateCode > 37) errors.push(`Invalid state code: ${stateCode} (must be 01-37)`);

    const panPortion = g.slice(2, 12);
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
    if (panPortion && !panRegex.test(panPortion)) errors.push('PAN portion in GSTIN appears invalid');

    const stateCodes: Record<number, string> = {
      1: 'J&K', 2: 'HP', 3: 'Punjab', 4: 'Chandigarh', 6: 'Haryana', 7: 'Delhi',
      8: 'Rajasthan', 9: 'UP', 10: 'Bihar', 11: 'Sikkim', 12: 'Arunachal Pradesh',
      13: 'Nagaland', 14: 'Manipur', 15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya',
      18: 'Assam', 19: 'West Bengal', 20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh',
      23: 'MP', 24: 'Gujarat', 25: 'Daman & Diu', 26: 'Dadra & NH', 27: 'Maharashtra',
      29: 'Karnataka', 30: 'Goa', 31: 'Lakshadweep', 32: 'Kerala', 33: 'Tamil Nadu',
      34: 'Puducherry', 35: 'A&N Islands', 36: 'Telangana', 37: 'AP',
    };

    return {
      valid: errors.length === 0,
      errors,
      details: errors.length === 0 ? {
        stateCode,
        state: stateCodes[stateCode] || 'Unknown',
        pan: panPortion,
        entityCode: g[12],
        entityType: g[13],
        checkDigit: g[14],
        registrationType: g[13] === 'Z' ? 'Normal Taxpayer' : 'Special',
      } : undefined,
    };
  }

  hsnLookup(code: string, type: 'HSN' | 'SAC' = 'HSN'): any {
    const db = type === 'HSN' ? HSN_RATES : SAC_RATES;
    // Try exact match first, then 4-digit prefix
    const entry = db[code] || db[code.slice(0, 4)] || db[code.slice(0, 6)];

    if (!entry) {
      return {
        found: false,
        code,
        type,
        message: `${type} code ${code} not found in Phase 1 database (partial list). Full 12,000+ HSN database in Phase 4.`,
        suggestion: 'Check GST Council HSN rate finder at cbic.gov.in',
      };
    }

    const cgst = entry.rate / 2;
    const sgst = entry.rate / 2;
    const igst = entry.rate;

    return {
      found: true,
      code,
      type,
      description: entry.description,
      gstRate: `${entry.rate}%`,
      cgst: `${cgst}%`,
      sgst: `${sgst}%`,
      igst: `${igst}%`,
      cess: entry.cess ? `${entry.cess}%` : 'N/A',
      source: 'GST Council Rate Schedule (Phase 1 subset)',
    };
  }

  calculateITC(dto: any): any {
    const { totalItcAvailable = 0, itcAsPerGSTR2B, itcClaimed = 0, reversalRequired = 0 } = dto;

    const eligible = Math.max(0, itcClaimed - reversalRequired);
    const mismatch = itcAsPerGSTR2B !== undefined ? Math.abs(itcClaimed - itcAsPerGSTR2B) : 0;
    const mismatchPct = itcAsPerGSTR2B ? ((mismatch / itcAsPerGSTR2B) * 100).toFixed(2) : '0';
    const riskLevel = mismatch > totalItcAvailable * 0.05 ? 'HIGH' : mismatch > 0 ? 'MEDIUM' : 'LOW';

    return {
      totalItcAvailable,
      itcClaimed,
      itcAsPerGSTR2B: itcAsPerGSTR2B || itcClaimed,
      mismatchAmount: mismatch,
      mismatchPercent: mismatchPct + '%',
      reversalRequired,
      netEligibleITC: eligible,
      riskLevel,
      recommendation: riskLevel === 'HIGH'
        ? '⚠️ HIGH RISK: ITC mismatch > 5%. Reconcile GSTR-2B immediately. Risk of notice u/s 61.'
        : riskLevel === 'MEDIUM'
        ? '⚠️ MEDIUM: Minor mismatch. Check supplier filing status on GST portal.'
        : '✅ ITC reconciliation looks clean.',
      rule: 'Section 16(2)(aa) — ITC only on amounts appearing in GSTR-2B',
    };
  }

  calculateLateFee(dto: any): any {
    const { returnType = 'GSTR-3B', dueDate, filingDate, isNilReturn = false } = dto;

    if (!dueDate || !filingDate) {
      return { error: 'dueDate and filingDate required (YYYY-MM-DD format)' };
    }

    const due = new Date(dueDate);
    const filed = new Date(filingDate);
    const lateDays = Math.max(0, Math.floor((filed.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));

    if (lateDays === 0) return { lateDays: 0, lateFee: 0, message: 'Filed on time! No late fee.' };

    // GST Late Fee Rules
    const dailyFee = isNilReturn ? 20 : 50; // ₹/day (CGST ₹10/₹25 + SGST ₹10/₹25)
    const maxFee = returnType === 'GSTR-9' ? 250000 : 10000; // Annual return: 0.25% of turnover (max ₹2.5L per form)

    const rawFee = lateDays * dailyFee;
    const lateFee = Math.min(rawFee, maxFee);
    const cgst = lateFee / 2;
    const sgst = lateFee / 2;

    return {
      returnType,
      dueDate,
      filingDate,
      lateDays,
      dailyFee: `₹${dailyFee}/day`,
      rawFee,
      maxFee,
      lateFee,
      cgstFee: cgst,
      sgstFee: sgst,
      isNilReturn,
      section: 'Section 47, CGST Act',
      note: isNilReturn ? 'Nil return: ₹20/day (CGST ₹10 + SGST ₹10)' : 'Normal return: ₹50/day (CGST ₹25 + SGST ₹25)',
    };
  }
}
