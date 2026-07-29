import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TaxEngineService } from './tax-engine.service';
import { CreateCalculationDto } from './dto/create-calculation.dto';

@Injectable()
export class CalculationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxEngine: TaxEngineService,
  ) {}

  async computeAndSave(userId: string, dto: CreateCalculationDto) {
    const result = this.taxEngine.computeIncomeTax({
      grossIncome: dto.grossIncome,
      regime: dto.regime,
      age: dto.age,
      deductions: dto.deductions,
      tdsDeducted: dto.tdsDeducted,
      advanceTaxPaid: dto.advanceTaxPaid,
      capitalGains: dto.capitalGains,
    });

    // Compare regimes for AI recommendation
    const comparison = this.taxEngine.compareRegimes(dto.grossIncome, dto.deductions || {});

    // Save to DB
    const saved = await this.prisma.taxCalculation.create({
      data: {
        userId,
        name: dto.name || `Tax Calculation ${new Date().getFullYear()}`,
        assessmentYear: dto.assessmentYear || '2025-26',
        entityType: (dto.entityType as any) || 'INDIVIDUAL',
        regime: dto.regime,
        salaryIncome: dto.grossIncome,
        grossTotalIncome: dto.grossIncome,
        deduction80C: dto.deductions?.d80C || 0,
        deduction80D: dto.deductions?.d80D || 0,
        deduction80CCD: dto.deductions?.d80CCD || 0,
        standardDeduction: result.standardDeduction,
        totalDeductions: result.totalDeductions,
        taxableIncome: result.taxableIncome,
        taxBeforeRebate: result.taxBeforeRebate,
        rebate87A: result.rebate87A,
        taxAfterRebate: result.taxAfterRebate,
        surcharge: result.surcharge,
        cess: result.cess,
        totalTaxLiability: result.netTaxLiability,
        tdsDeducted: dto.tdsDeducted || 0,
        advanceTaxPaid: dto.advanceTaxPaid || 0,
        refundAmount: result.refundAmount,
        interest234B: result.interest['234B'],
        aiRegimeRecommendation: comparison.recommendation as any,
        aiSavingAmount: comparison.savingAmount,
        aiTips: [comparison.message],
      },
    });

    return { ...result, comparison, savedId: saved.id, message: 'Calculation saved successfully' };
  }

  async getAll(userId: string) {
    return this.prisma.taxCalculation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getById(userId: string, id: string) {
    return this.prisma.taxCalculation.findFirst({ where: { id, userId } });
  }

  async delete(userId: string, id: string) {
    await this.prisma.taxCalculation.deleteMany({ where: { id, userId } });
    return { message: 'Calculation deleted' };
  }

  // Quick calculators (no DB save)
  computeHRA(params: any)     { return this.taxEngine.computeHRAExemption(params.basic, params.hraReceived, params.rentPaid, params.isMetro); }
  computeSIP(params: any)     { return this.taxEngine.computeSIP(params.monthlyAmount, params.annualReturn, params.years); }
  computeEMI(params: any)     { return this.taxEngine.computeEMI(params.principal, params.annualRate, params.years); }
  computeGratuity(params: any){ return this.taxEngine.computeGratuity(params.basicDA, params.years, params.isCovered); }
  computeGST(params: any)     { return this.taxEngine.computeGST(params.amount, params.rate, params.isInclusive, params.isInterState); }
  computeCapitalGain(p: any)  { return this.taxEngine.computeCapitalGain(p.buyPrice, p.sellPrice, p.assetType, p.isLTCG, p.improve); }
  compareRegimes(params: any) { return this.taxEngine.compareRegimes(params.income, params.deductions); }
}
