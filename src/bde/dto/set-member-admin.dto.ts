import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetMemberAdminDto {
  @ApiProperty({ description: 'Donner (true) ou retirer (false) les droits admin' })
  @IsBoolean()
  isAdmin: boolean;
}
