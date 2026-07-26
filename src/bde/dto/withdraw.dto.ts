import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WithdrawDto {
  @ApiProperty({ minimum: 20, description: 'Montant à retirer (multiple de 20 €)' })
  @IsNumber()
  @Min(20)
  amount: number;
}
