import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { GeocodingService } from './geocoding.service';

@Module({
  providers: [EventsService, GeocodingService],
  controllers: [EventsController],
})
export class EventsModule {}
