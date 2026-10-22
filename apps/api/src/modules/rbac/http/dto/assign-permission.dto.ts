import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AssignPermissionDto {
  @ApiProperty({ example: 'user:read' })
  @IsString()
  @IsNotEmpty()
  permissionKey: string;
}
