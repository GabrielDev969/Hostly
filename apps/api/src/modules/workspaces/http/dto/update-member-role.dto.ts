import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpdateMemberRoleDto {
  @ApiProperty({ format: 'uuid', description: 'New role id for the member' })
  @IsUUID()
  roleId: string;
}
