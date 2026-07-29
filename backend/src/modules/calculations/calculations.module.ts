import { Module } from '@nestjs/common';
import { CalculationsController } from './calculations.controller';
import { CalculationsService } from './calculations.service';
import { TaxEngineService } from './tax-engine.service';

@Module({
  controllers: [CalculationsController],
  providers: [CalculationsService, TaxEngineService],
  exports: [TaxEngineService],
})
export class CalculationsModule {}
