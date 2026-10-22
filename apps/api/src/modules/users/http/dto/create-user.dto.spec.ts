import { plainToInstance } from 'class-transformer';
import { CreateUserDto } from './create-user.dto';

describe('CreateUserDto', () => {
  it('lowercases and trims email', () => {
    const dto = plainToInstance(CreateUserDto, {
      email: '  Jane@X.COM  ',
      name: 'Jane',
      password: 'StrongPass@123',
      roleId: 'r1',
    });
    expect(dto.email).toBe('jane@x.com');
    expect(dto.name).toBe('Jane');
  });

  it('passes non-string email through unchanged', () => {
    const dto = plainToInstance(CreateUserDto, {
      email: 123,
      name: 'Jane',
      password: 'StrongPass@123',
      roleId: 'r1',
    });
    expect(dto.email as unknown as number).toBe(123);
  });

  it('trims name and passes non-string through', () => {
    const dto = plainToInstance(CreateUserDto, {
      email: 'a@b.c',
      name: '  Spaced  ',
      password: 'StrongPass@123',
      roleId: 'r1',
    });
    expect(dto.name).toBe('Spaced');
    const dto2 = plainToInstance(CreateUserDto, {
      email: 'a@b.c',
      name: 5,
      password: 'StrongPass@123',
      roleId: 'r1',
    });
    expect(dto2.name as unknown as number).toBe(5);
  });
});
