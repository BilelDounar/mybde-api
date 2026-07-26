import { IsOptional, IsString, IsBoolean, IsInt, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profilePicture?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  university?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  program?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'PRIVATE'] })
  @IsOptional()
  @IsEnum(['PUBLIC', 'PRIVATE'])
  privacyLevel?: 'PUBLIC' | 'PRIVATE';

  @ApiPropertyOptional({ enum: ['LIGHT', 'DARK', 'SYSTEM'] })
  @IsOptional()
  @IsEnum(['LIGHT', 'DARK', 'SYSTEM'])
  theme?: 'LIGHT' | 'DARK' | 'SYSTEM';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;
}
