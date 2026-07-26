import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { NewsModule } from '../news/news.module';

@Module({
  imports: [NewsModule],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
