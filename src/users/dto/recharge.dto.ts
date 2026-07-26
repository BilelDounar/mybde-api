import { IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RechargeDto {
  @ApiProperty({ minimum: 1, maximum: 1000, description: 'Montant à créditer (€)' })
  @IsNumber()
  @Min(1)
  @Max(1000)
  amount: number;
}
