import { IsInt, Min, Max, IsOptional, IsIn, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PurchaseDto {
  @ApiProperty({ minimum: 1, maximum: 10, default: 1 })
  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number;

  @ApiProperty({ description: 'Identifiant du tarif choisi (EventTicketTier)' })
  @IsString()
  @IsNotEmpty()
  tierId: string;

  @ApiPropertyOptional({ enum: ['card', 'balance'], default: 'card' })
  @IsOptional()
  @IsIn(['card', 'balance'])
  paymentMethod?: 'card' | 'balance';
}
