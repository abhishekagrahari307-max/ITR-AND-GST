import { Module } from '@nestjs/common';
import { GstReturnController } from './gst-return.controller';
import { GstReturnService } from './gst-return.service';
import { ValidationEngineModule } from '../validation/validation-engine.module';

@Module({
  imports: [ValidationEngineModule],
  controllers: [GstReturnController],
  providers: [GstReturnService],
  exports: [GstReturnService],
})
export class GstModule {}
