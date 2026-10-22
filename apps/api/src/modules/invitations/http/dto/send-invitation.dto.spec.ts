import { plainToInstance } from 'class-transformer';
import { SendInvitationDto } from './send-invitation.dto';

describe('SendInvitationDto', () => {
  it('lowercases and trims email', () => {
    const dto = plainToInstance(SendInvitationDto, {
      email: '  Jane@X.COM  ',
      roleId: 'r1',
    });
    expect(dto.email).toBe('jane@x.com');
  });

  it('passes non-string email through unchanged', () => {
    const dto = plainToInstance(SendInvitationDto, {
      email: 0,
      roleId: 'r1',
    });
    expect(dto.email as unknown as number).toBe(0);
  });
});
