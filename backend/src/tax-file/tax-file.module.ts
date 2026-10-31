import { Module } from '@nestjs/common';
import { TaxFileController } from './tax-file.controller';
import { TaxFileService } from './tax-file.service';
import { ValidationEngineModule } from '../validation/validation-engine.module';

@Module({
  imports: [ValidationEngineModule],
  controllers: [TaxFileController],
  providers: [TaxFileService],
  exports: [TaxFileService],
})
export class TaxFileModule {}
