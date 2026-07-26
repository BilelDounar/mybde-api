import { Module } from '@nestjs/common';
import { BdeService } from './bde.service';
import { BdeController } from './bde.controller';

@Module({
  providers: [BdeService],
  controllers: [BdeController],
  exports: [BdeService],
})
export class BdeModule {}
