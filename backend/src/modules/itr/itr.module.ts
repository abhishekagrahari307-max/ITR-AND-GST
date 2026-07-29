import { Module } from '@nestjs/common';
import { ItrController } from './itr.controller';
import { ItrService } from './itr.service';

@Module({
  controllers: [ItrController],
  providers:   [ItrService],
  exports:     [ItrService],
})
export class ItrModule {}
