import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class SetRoleDto {
  @ApiProperty({ enum: ['STUDENT', 'ADMIN_BDE', 'SUPER_ADMIN'] })
  @IsIn(['STUDENT', 'ADMIN_BDE', 'SUPER_ADMIN'])
  role: Role;
}
