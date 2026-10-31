import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';

/**
 * TaxMitra Enterprise — Compliance Controller (Phase 3)
 * Developer: Abhishek Agrahari
 *
 * Routes:
 *   GET  /api/compliance/calendar             → IT/GST/TDS/ROC due dates
 *   GET  /api/compliance/upcoming             → Upcoming deadlines (next 30 days)
 *   POST /api/compliance/reminder             → Schedule AI reminder notification
 *   POST /api/compliance/penalty-calc         → 234A/B/C + GST late fee + TDS interest
 *   GET  /api/compliance/penalties/summary    → All pending penalties summary
 *   POST /api/compliance/interest-calc        → GST interest calculator
 *   GET  /api/compliance/roc-calendar         → ROC/Company Law due dates
 *   GET  /api/compliance/health-score         → Compliance health score for a client
 */

@ApiTags('Compliance — Calendar + Reminders + Penalty Calc')
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  @Get('calendar')
  @ApiOperation({ summary: 'Full IT/GST/TDS/ROC compliance calendar' })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM (default: current month)' })
  @ApiQuery({ name: 'category', required: false, enum: ['ITR', 'GST', 'TDS', 'ROC', 'ALL'] })
  @ApiResponse({ status: 200, description: 'Due date calendar' })
  calendar(@Query('month') month?: string, @Query('category') category?: string) {
    return this.svc.getCalendar(month, category);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Upcoming deadlines in next N days' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days ahead (default: 30)' })
  @ApiQuery({ name: 'clientId', required: false })
  upcoming(@Query('days') days?: string, @Query('clientId') clientId?: string) {
    return this.svc.getUpcoming(parseInt(days || '30'), clientId);
  }

  @Post('reminder')
  @ApiOperation({ summary: 'Schedule AI compliance reminder (Email/SMS/WhatsApp)' })
  @ApiBody({
    schema: {
      example: {
        clientId: 'c-001', dueDate: '2026-07-31', complianceType: 'ITR',
        channels: ['email', 'whatsapp'], alertDaysBefore: [30, 15, 7, 1],
        message: 'ITR filing deadline approaching. Please share Form 16.',
      },
    },
  })
  scheduleReminder(@Body() dto: any) { return this.svc.scheduleReminder(dto); }

  @Post('penalty-calc')
  @ApiOperation({ summary: 'Income Tax penalty & interest calculator (234A/B/C + late fee)' })
  @ApiBody({
    schema: {
      example: {
        taxDue: 100000,
        advanceTaxPaid: 60000,
        selfAssessmentTaxPaid: 0,
        filingDate: '2026-08-31',
        dueDate: '2026-07-31',
        isAuditCase: false,
        fy: '2025-26',
      },
    },
  })
  calcPenalty(@Body() dto: any) { return this.svc.calculatePenalty(dto); }

  @Post('interest-calc')
  @ApiOperation({ summary: 'GST interest calculator (Section 50)' })
  @ApiBody({
    schema: {
      example: {
        taxDue: 50000, dueDate: '2025-07-20', paymentDate: '2025-08-15',
        interestRate: 18, isITC: false,
      },
    },
  })
  calcGSTInterest(@Body() dto: any) { return this.svc.calculateGSTInterest(dto); }

  @Get('penalties/summary')
  @ApiOperation({ summary: 'Summary of all pending penalties for a client/period' })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'fy', required: false })
  penaltySummary(@Query() q: any) { return this.svc.penaltySummary(q); }

  @Get('roc-calendar')
  @ApiOperation({ summary: 'ROC / Company Law compliance due dates' })
  rocCalendar(@Query('fy') fy?: string) { return this.svc.rocCalendar(fy); }

  @Get('health-score')
  @ApiOperation({ summary: 'Compliance health score for a taxpayer/client (0-100)' })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'pan', required: false })
  healthScore(@Query() q: any) { return this.svc.complianceHealthScore(q); }
}
