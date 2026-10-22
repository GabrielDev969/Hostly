import { plainToInstance } from 'class-transformer';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it('lowercases and trims email', () => {
    const dto = plainToInstance(LoginDto, {
      email: '  Jane@X.COM  ',
      password: 'StrongPass@1',
    });
    expect(dto.email).toBe('jane@x.com');
  });

  it('passes non-string email through unchanged', () => {
    const dto = plainToInstance(LoginDto, {
      email: null,
      password: 'StrongPass@1',
    });
    expect(dto.email).toBeNull();
  });
});
