import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NewsService } from './news.service';
import { NewsController } from './news.controller';
import { NewsPost, NewsPostSchema } from './schemas/news-post.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: NewsPost.name, schema: NewsPostSchema }]),
  ],
  providers: [NewsService],
  controllers: [NewsController],
  exports: [NewsService],
})
export class NewsModule {}
