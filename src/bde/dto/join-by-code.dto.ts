import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinByCodeDto {
  @ApiProperty({ description: "Code d'invitation à 6 chiffres du BDE", example: '482913' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Le code doit contenir exactement 6 chiffres' })
  code: string;
}
