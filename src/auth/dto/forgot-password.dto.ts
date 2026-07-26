import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'bilel@mybde.fr' })
  @IsEmail()
  email: string;
}
