import { plainToInstance } from 'class-transformer';
import { UpdateUserDto } from './update-user.dto';

describe('UpdateUserDto', () => {
  it('lowercases and trims email', () => {
    const dto = plainToInstance(UpdateUserDto, { email: '  ABC@X.COM  ' });
    expect(dto.email).toBe('abc@x.com');
  });

  it('passes non-string email through unchanged', () => {
    const dto = plainToInstance(UpdateUserDto, { email: 42 });
    expect(dto.email as unknown as number).toBe(42);
  });

  it('trims name', () => {
    const dto = plainToInstance(UpdateUserDto, { name: '  John  ' });
    expect(dto.name).toBe('John');
  });

  it('passes non-string name through', () => {
    const dto = plainToInstance(UpdateUserDto, { name: 99 });
    expect(dto.name as unknown as number).toBe(99);
  });
});
