import { Module } from '@nestjs/common';
import { ValidationEngineService } from './validation-engine.service';
import { ValidationController } from './validation.controller';

@Module({
  controllers: [ValidationController],
  providers: [ValidationEngineService],
  exports: [ValidationEngineService], // shared with TaxFile, GST modules
})
export class ValidationEngineModule {}
