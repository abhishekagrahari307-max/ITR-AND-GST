import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { ValidationEngineService } from './validation-engine.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery } from '@nestjs/swagger';

/**
 * TaxMitra Enterprise — Validation Engine Controller
 * Developer: Abhishek Agrahari
 * Endpoints:
 *   POST /api/validation/check       → Run rules for a category
 *   POST /api/validation/check-all   → Run all 6 categories
 *   GET  /api/validation/categories  → List categories + rule counts
 *   GET  /api/validation/rules/:id   → Get specific rule detail
 */

@ApiTags('Validation Engine — 1000+ Rules')
@Controller('validation')
export class ValidationController {
  constructor(private readonly engine: ValidationEngineService) {}

  @Post('check')
  @ApiOperation({
    summary: 'Run validation rules for a category',
    description: 'Pass `category` (personal/income/deductions/gst/banking/filing) and `data` object. Returns pass/fail per rule.',
  })
  @ApiBody({
    schema: {
      example: {
        category: 'personal',
        data: {
          pan: 'ABCDE1234F',
          aadhaar: '123456789012',
          mobile: '9876543210',
          email: 'user@example.com',
          dob: '1990-01-15',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Validation result with pass/fail details' })
  runCheck(@Body() payload: { category: string; data: any }) {
    return this.engine.runFullValidation(payload.category, payload.data);
  }

  @Post('check-all')
  @ApiOperation({
    summary: 'Run ALL 6 categories of validation rules',
    description: 'Full validation across personal, income, deductions, gst, banking, filing. Returns combined report.',
  })
  @ApiBody({
    schema: {
      example: {
        pan: 'ABCDE1234F',
        aadhaar: '123456789012',
        mobile: '9876543210',
        totalIncome: 1200000,
        formType: 'ITR-1',
        deduction80C: 150000,
        gstin: '09ABCDE1234F1Z5',
        ifsc: 'SBIN0001234',
        accountNumber: '123456789012',
      },
    },
  })
  @ApiResponse({ status: 200, description: 'All category validation results' })
  runAllCategories(@Body() data: any) {
    return this.engine.runAllCategories(data);
  }

  @Get('categories')
  @ApiOperation({
    summary: 'List all validation categories with rule counts',
    description: 'Returns 6 categories: personal, income, deductions, gst, banking, filing with rule counts and descriptions.',
  })
  @ApiResponse({ status: 200, description: 'Category list with rule counts' })
  listCategories() {
    return {
      categories: this.engine.getCategories(),
      totalRules: this.engine.getCategories().reduce((sum, c) => sum + c.count, 0),
      targetRules: 1000,
      phase: 'Phase 1 Skeleton — expanding to 1000+ in Phase 4',
      developer: 'Abhishek Agrahari',
    };
  }

  @Get('rules/:ruleId')
  @ApiOperation({ summary: 'Get specific rule by ID (e.g., P001, I005, D002)' })
  getRule(@Param('ruleId') ruleId: string) {
    const rule = this.engine.getRule(ruleId);
    if (!rule) return { error: `Rule ${ruleId} not found` };
    return {
      id: rule.id,
      category: rule.category,
      subcategory: rule.subcategory,
      description: rule.description,
      severity: rule.severity,
      message: rule.message,
      section: rule.section,
    };
  }
}
