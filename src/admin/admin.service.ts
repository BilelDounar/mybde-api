import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NewsService } from '../news/news.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly newsService: NewsService,
  ) {}

  async summary() {
    const [usersCount, bdesCount, eventsCount, newsCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.bDE.count(),
      this.prisma.event.count(),
      this.newsService.countAll(),
    ]);
    return { usersCount, bdesCount, eventsCount, newsCount };
  }
}
