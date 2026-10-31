import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { TaxFileService } from './tax-file.service';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';

/**
 * TaxMitra Enterprise — ITR Filing Controller
 * Developer: Abhishek Agrahari
 *
 * Routes:
 *   POST   /api/tax-files         → Create ITR Draft
 *   GET    /api/tax-files         → List all filings (filter by userId, status, ay)
 *   GET    /api/tax-files/:id     → Get single filing with validation history
 *   PATCH  /api/tax-files/:id     → Update status / submit / verify
 *   DELETE /api/tax-files/:id     → Delete draft
 *   POST   /api/tax-files/:id/validate → Run validation on a filing
 *   POST   /api/tax-files/:id/compute  → Compute tax for a filing
 *   GET    /api/tax-files/compute/preview → Quick tax preview (no DB)
 */

@ApiTags('TaxFile — ITR Filing Engine')
@Controller('tax-files')
export class TaxFileController {
  constructor(private readonly svc: TaxFileService) {}

  @Post()
  @ApiOperation({ summary: 'Create / File new ITR (starts as Draft)' })
  @ApiBody({
    schema: {
      example: {
        userId: 'u-001',
        clientId: 'c-001',
        assessmentYear: 'AY-2026-27',
        formType: 'ITR-1',
        regime: 'NEW',
        jsonData: {
          personalInfo: { name: 'Demo User', pan: 'ABCDE1234F', dob: '1990-01-01' },
          incomeDetails: { salary: 1200000, standardDeduction: 75000 },
          deductions: { u80C: 150000 },
          bankDetails: { accountNumber: '123456789012', ifsc: 'SBIN0001234' },
        },
        computedTax: 52000,
        refundDue: 8500,
      },
    },
  })
  @ApiResponse({ status: 201, description: 'ITR Draft created with validation report' })
  create(@Body() dto: any) {
    return this.svc.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List ITR filings with optional filters' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'SUBMITTED', 'VERIFIED', 'COMPLETE'] })
  @ApiQuery({ name: 'ay', required: false, description: 'Assessment Year (e.g., AY-2026-27)' })
  @ApiQuery({ name: 'formType', required: false, description: 'ITR Form type (ITR-1 to ITR-7)' })
  @ApiResponse({ status: 200, description: 'List of tax filings' })
  findAll(@Query() query: any) {
    return this.svc.findAll(query);
  }

  @Get('compute/preview')
  @ApiOperation({ summary: 'Quick tax preview without saving to DB' })
  @ApiQuery({ name: 'income', required: true, description: 'Gross income in rupees' })
  @ApiQuery({ name: 'regime', required: false, enum: ['OLD', 'NEW'], description: 'Tax regime' })
  @ApiQuery({ name: 'deductions', required: false, description: 'Total deductions (Old Regime only)' })
  quickCompute(@Query('income') income: string, @Query('regime') regime = 'NEW', @Query('deductions') deductions = '0') {
    return this.svc.quickCompute(parseFloat(income) || 0, regime as 'OLD' | 'NEW', parseFloat(deductions) || 0);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single tax filing with validation history and audit log' })
  @ApiParam({ name: 'id', description: 'Tax File UUID' })
  @ApiResponse({ status: 200, description: 'Tax file detail' })
  @ApiResponse({ status: 404, description: 'Tax file not found' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update filing status or data (Draft → Submitted → Verified → Complete)' })
  @ApiParam({ name: 'id', description: 'Tax File UUID' })
  @ApiBody({
    schema: {
      example: {
        status: 'SUBMITTED',
        portalAck: 'AY202627-ACK-12345678',
        computedTax: 52000,
      },
    },
  })
  update(@Param('id') id: string, @Body() dto: any) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete draft ITR (only DRAFT status)' })
  @ApiParam({ name: 'id', description: 'Tax File UUID' })
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Post(':id/validate')
  @ApiOperation({ summary: 'Run 1000+ validation rules on a specific tax file' })
  @ApiParam({ name: 'id', description: 'Tax File UUID' })
  validate(@Param('id') id: string) {
    return this.svc.validateFile(id);
  }

  @Post(':id/compute')
  @ApiOperation({ summary: 'Compute tax liability for a tax file and update DB' })
  @ApiParam({ name: 'id', description: 'Tax File UUID' })
  compute(@Param('id') id: string) {
    return this.svc.computeTax(id);
  }
}
