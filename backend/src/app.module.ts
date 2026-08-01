import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ValidationEngineModule } from './validation/validation-engine.module';
import { TaxFileModule } from './tax-file/tax-file.module';
import { GstModule } from './gst/gst-return.module';
import { PracticeModule } from './practice/practice.module';
import { AccountingModule } from './accounting/accounting.module';
import { ComplianceModule } from './compliance/compliance.module';

/**
 * TaxMitra Enterprise — Root Application Module
 * Developer: Abhishek Agrahari
 * Phase 1: ValidationEngine + TaxFile + GST APIs
 * Phase 3: Practice CRM + Accounting + Compliance
 * Phase 4: Auth + TDS + WhiteLabel + Franchise
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    // Phase 1 Modules
    ValidationEngineModule,
    TaxFileModule,
    GstModule,
    // Phase 3 Modules
    PracticeModule,
    AccountingModule,
    ComplianceModule,
    // Planned Phase 4: AuthModule, TdsModule, WhiteLabelModule, FranchiseModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
