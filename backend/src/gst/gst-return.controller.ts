import { Controller, Get, Post, Body, Param, Patch, Query, Delete } from '@nestjs/common';
import { GstReturnService } from './gst-return.service';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';

/**
 * TaxMitra Enterprise — GST Return Controller
 * Developer: Abhishek Agrahari
 *
 * Routes:
 *   POST  /api/gst-returns          → Create GSTR (1/3B/9/9C)
 *   GET   /api/gst-returns          → List returns (filter by gstin/period/type)
 *   GET   /api/gst-returns/:id      → Get return + ITC reconciliation
 *   PATCH /api/gst-returns/:id      → Update / mark as filed
 *   POST  /api/gst-returns/validate-gstin → GSTIN validation
 *   POST  /api/gst-returns/hsn-lookup    → HSN/SAC code search
 *   POST  /api/gst-returns/itc-calc      → ITC calculation
 *   POST  /api/gst-returns/late-fee      → Late filing fee calculation
 */

@ApiTags('GST — GSTR Filing Suite')
@Controller('gst-returns')
export class GstReturnController {
  constructor(private readonly svc: GstReturnService) {}

  @Post()
  @ApiOperation({ summary: 'Create GSTR return (GSTR-1 / GSTR-3B / GSTR-9 / GSTR-9C)' })
  @ApiBody({
    schema: {
      example: {
        userId: 'u-001',
        gstin: '09ABCDE1234F1Z5',
        returnType: 'GSTR-3B',
        period: '2025-07',
        jsonData: {
          outwardSupplies: { taxable: 500000, igst: 45000, cgst: 22500, sgst: 22500 },
          itcAvailable: { igst: 20000, cgst: 10000, sgst: 10000 },
          itcUtilized: { igst: 20000, cgst: 10000, sgst: 10000 },
          taxPayable: { igst: 25000, cgst: 12500, sgst: 12500 },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'GSTR return created' })
  create(@Body() dto: any) {
    return this.svc.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List GST returns with filters' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'gstin', required: false })
  @ApiQuery({ name: 'type', required: false, enum: ['GSTR-1', 'GSTR-3B', 'GSTR-9', 'GSTR-9C'] })
  @ApiQuery({ name: 'period', required: false, description: 'YYYY-MM format' })
  findAll(@Query() q: any) {
    return this.svc.findAll(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get GST return detail with ITC reconciliation status' })
  @ApiParam({ name: 'id', description: 'GST Return UUID' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update GST return (set filed status + GSTN acknowledgment)' })
  @ApiParam({ name: 'id', description: 'GST Return UUID' })
  @ApiBody({
    schema: {
      example: { status: 'COMPLETE', gstnAck: 'ARN123456789012Y', filedDate: '2025-07-20' },
    },
  })
  update(@Param('id') id: string, @Body() dto: any) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete draft GST return' })
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Post('validate-gstin')
  @ApiOperation({ summary: 'Validate GSTIN format and extract details' })
  @ApiBody({ schema: { example: { gstin: '09ABCDE1234F1Z5' } } })
  validateGSTIN(@Body('gstin') gstin: string) {
    return this.svc.validateGSTIN(gstin);
  }

  @Post('hsn-lookup')
  @ApiOperation({ summary: 'HSN/SAC code lookup and GST rate finder' })
  @ApiBody({ schema: { example: { code: '8471', type: 'HSN' } } })
  hsnLookup(@Body() dto: { code: string; type: 'HSN' | 'SAC' }) {
    return this.svc.hsnLookup(dto.code, dto.type);
  }

  @Post('itc-calc')
  @ApiOperation({ summary: 'ITC eligibility calculation and reconciliation' })
  @ApiBody({
    schema: {
      example: {
        totalItcAvailable: 100000,
        itcAsPerGSTR2B: 95000,
        itcClaimed: 100000,
        reversalRequired: 5000,
      },
    },
  })
  calcITC(@Body() dto: any) {
    return this.svc.calculateITC(dto);
  }

  @Post('late-fee')
  @ApiOperation({ summary: 'GST late filing fee calculator' })
  @ApiBody({
    schema: {
      example: {
        returnType: 'GSTR-3B',
        dueDate: '2025-07-20',
        filingDate: '2025-08-15',
        isNilReturn: false,
        state: 'UP',
      },
    },
  })
  calcLateFee(@Body() dto: any) {
    return this.svc.calculateLateFee(dto);
  }
}
