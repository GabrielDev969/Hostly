import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, IsUUID, MaxLength } from 'class-validator';

export class SendInvitationDto {
  @ApiProperty({ example: 'newmember@company.com' })
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim().toLowerCase() : (value as unknown),
  )
  email: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Role to assign upon acceptance',
  })
  @IsUUID('4')
  roleId: string;
}
