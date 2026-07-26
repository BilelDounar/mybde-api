import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'bilel@mybde.fr' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Test1234' })
  @IsString()
  @MinLength(6)
  password: string;
}
