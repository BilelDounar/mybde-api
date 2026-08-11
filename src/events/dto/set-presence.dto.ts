import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetPresenceDto {
  @ApiProperty({ description: 'true = présent (billet marqué utilisé), false = absent' })
  @IsBoolean()
  present: boolean;
}
