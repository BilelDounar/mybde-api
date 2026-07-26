import { IsEmail, IsString, MinLength, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Bilel Dounar' })
  @IsString()
  displayName: string;

  @ApiProperty({ example: 'bilel@mybde.fr' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Test1234', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: 'Université Paris-Saclay' })
  @IsOptional()
  @IsString()
  university?: string;

  @ApiPropertyOptional({ example: 'Informatique' })
  @IsOptional()
  @IsString()
  program?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  year?: number;
}
