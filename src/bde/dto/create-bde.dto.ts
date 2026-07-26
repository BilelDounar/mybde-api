import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BdeStatus } from '@prisma/client';

export class CreateBdeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Généré depuis le nom si absent' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  university: string;

  @ApiPropertyOptional({ enum: BdeStatus })
  @IsOptional()
  @IsEnum(BdeStatus)
  status?: BdeStatus;
}
