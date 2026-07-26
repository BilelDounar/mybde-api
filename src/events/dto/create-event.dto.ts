import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  IsNumber,
  IsEnum,
  IsArray,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventCategory, EventStatus } from '@prisma/client';

export class TicketTierDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateEventDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bdeId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiProperty({ example: '2026-12-15T00:00:00.000Z' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: '20:00' })
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({ example: '23:00' })
  @IsString()
  @IsNotEmpty()
  endTime: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  location: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  capacity: number;

  @ApiPropertyOptional({ enum: EventCategory })
  @IsOptional()
  @IsEnum(EventCategory)
  category?: EventCategory;

  @ApiPropertyOptional({ enum: EventStatus })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [TicketTierDto], description: 'Tarifs de billet (au moins un requis en pratique). Défaut : un tarif "Standard" à 0€.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketTierDto)
  ticketTiers?: TicketTierDto[];
}
