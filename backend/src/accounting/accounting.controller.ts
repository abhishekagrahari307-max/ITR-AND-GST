import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AccountingService } from './accounting.service';

/**
 * TaxMitra Enterprise — Accounting Controller (Phase 3)
 * Developer: Abhishek Agrahari
 *
 * Covers: Ledger · Journal · Trial Balance · P&L · Balance Sheet
 *         BRS (Bank Reconciliation) · Payroll · Fixed Assets · Year Closing
 */

@ApiTags('Accounting — Ledger + P&L + BRS + Payroll')
@Controller('accounting')
export class AccountingController {
  constructor(private readonly svc: AccountingService) {}

  // ── Ledger ───────────────────────────────────────────────

  @Post('ledger')
  @ApiOperation({ summary: 'Post a double-entry ledger transaction' })
  @ApiBody({
    schema: {
      example: {
        date: '2025-07-15', narration: 'GST Payment July 2025',
        debitAccount: 'Output GST Payable', creditAccount: 'Bank Account',
        amount: 28000, reference: 'GST-JUL-2025', branchId: 'b-001',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Ledger entry posted' })
  postLedger(@Body() dto: any) { return this.svc.postLedger(dto); }

  @Get('ledger')
  @ApiOperation({ summary: 'Get ledger entries (filter by account/date/branch)' })
  @ApiQuery({ name: 'account', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'branchId', required: false })
  getLedger(@Query() q: any) { return this.svc.getLedger(q); }

  // ── Trial Balance ─────────────────────────────────────────

  @Get('trial-balance')
  @ApiOperation({ summary: 'Generate Trial Balance as of date' })
  @ApiQuery({ name: 'asOf', required: false, description: 'YYYY-MM-DD (default: today)' })
  @ApiQuery({ name: 'branchId', required: false })
  trialBalance(@Query('asOf') asOf?: string, @Query('branchId') branchId?: string) {
    return this.svc.trialBalance(asOf, branchId);
  }

  // ── P&L ──────────────────────────────────────────────────

  @Get('pl')
  @ApiOperation({ summary: 'Profit & Loss Statement for period' })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD (default: FY start)' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD (default: today)' })
  @ApiQuery({ name: 'branchId', required: false })
  profitAndLoss(@Query() q: any) { return this.svc.profitAndLoss(q); }

  // ── Balance Sheet ─────────────────────────────────────────

  @Get('balance-sheet')
  @ApiOperation({ summary: 'Balance Sheet as of date' })
  @ApiQuery({ name: 'asOf', required: false })
  balanceSheet(@Query('asOf') asOf?: string) { return this.svc.balanceSheet(asOf); }

  // ── Bank Reconciliation ───────────────────────────────────

  @Post('bank-reconciliation')
  @ApiOperation({ summary: 'Upload bank statement for BRS reconciliation' })
  @ApiBody({
    schema: {
      example: {
        branchId: 'b-001', period: '2025-07',
        bankBalance: 580000, bookBalance: 572000,
        unreconciledItems: [
          { date: '2025-07-29', description: 'Cheque issued not cleared', amount: 8000, type: 'OUTSTANDING_CHEQUE' },
        ],
      },
    },
  })
  bankReconciliation(@Body() dto: any) { return this.svc.bankReconciliation(dto); }

  @Get('bank-reconciliation/summary')
  @ApiOperation({ summary: 'BRS summary for current period' })
  brsSummary(@Query('period') period?: string) { return this.svc.brsSummary(period); }

  // ── Payroll ──────────────────────────────────────────────

  @Post('payroll/process')
  @ApiOperation({ summary: 'Process monthly payroll for all staff' })
  @ApiBody({
    schema: {
      example: {
        month: '2025-07', branchId: 'b-001',
        employees: [
          { id: 's-001', name: 'Priya Sharma', grossSalary: 55000, tds: 5500, pf: 1800, esi: 0 },
          { id: 's-002', name: 'Amit Singh', grossSalary: 35000, tds: 2500, pf: 1800, esi: 412 },
        ],
      },
    },
  })
  processPayroll(@Body() dto: any) { return this.svc.processPayroll(dto); }

  @Get('payroll/history')
  @ApiOperation({ summary: 'Payroll processing history' })
  payrollHistory(@Query('month') month?: string) { return this.svc.payrollHistory(month); }

  // ── Fixed Assets ─────────────────────────────────────────

  @Get('fixed-assets')
  @ApiOperation({ summary: 'Fixed assets register with WDV/SLM depreciation' })
  @ApiQuery({ name: 'fy', required: false, description: 'Financial year (e.g., 2025-26)' })
  fixedAssets(@Query('fy') fy?: string) { return this.svc.fixedAssetsRegister(fy); }

  @Post('fixed-assets')
  @ApiOperation({ summary: 'Add fixed asset to register' })
  @ApiBody({
    schema: {
      example: { name: 'Office Computers x5', category: 'Computer', cost: 250000, purchaseDate: '2025-04-01', depRate: 40, method: 'WDV' },
    },
  })
  addFixedAsset(@Body() dto: any) { return this.svc.addFixedAsset(dto); }

  // ── Reports ──────────────────────────────────────────────

  @Get('reports/cash-flow')
  @ApiOperation({ summary: 'Cash Flow Statement' })
  cashFlow(@Query('period') period?: string) { return this.svc.cashFlow(period); }

  @Get('reports/financial-ratios')
  @ApiOperation({ summary: 'Financial Health Ratios (Current Ratio, Debt-Equity, etc.)' })
  financialRatios() { return this.svc.financialRatios(); }

  @Post('year-closing')
  @ApiOperation({ summary: 'Perform year-end closing entries' })
  @ApiBody({ schema: { example: { fy: '2025-26', closingDate: '2026-03-31' } } })
  yearClosing(@Body() dto: any) { return this.svc.yearClosing(dto); }
}
