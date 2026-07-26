import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateTicketDto {
  @ApiProperty()
  @IsString()
  qrCode: string;
}
