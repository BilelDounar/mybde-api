import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BdeModule } from './bde/bde.module';
import { EventsModule } from './events/events.module';
import { TicketsModule } from './tickets/tickets.module';
import { NewsModule } from './news/news.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // ─── PostgreSQL via Prisma ────────────────────────────
    PrismaModule,
    // ─── MongoDB via Mongoose ─────────────────────────────
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    AuthModule,
    UsersModule,
    BdeModule,
    EventsModule,
    TicketsModule,
    NewsModule,
    AdminModule,
  ],
})
export class AppModule {}
