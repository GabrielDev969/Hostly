import { validate } from 'class-validator';
import { IsStrongPassword } from './is-strong-password.decorator';

class TestDto {
  email?: string;
  name?: string;

  @IsStrongPassword()
  password!: unknown;
}

function buildDto(input: Partial<TestDto>): TestDto {
  const dto = new TestDto();
  Object.assign(dto, input);
  return dto;
}

describe('IsStrongPassword decorator', () => {
  it('passes for a strong password unrelated to user context', async () => {
    const errors = await validate(
      buildDto({
        email: 'jane@example.com',
        name: 'Jane Doe',
        password: 'Tr0ub4dor#Castle9!',
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it('rejects non-string values with a clear default message', async () => {
    const errors = await validate(buildDto({ password: 12345 }));

    expect(errors).toHaveLength(1);
    const constraints = errors[0]!.constraints ?? {};
    expect(Object.values(constraints).join(' ')).toMatch(/Password must be a string/);
  });

  it('aggregates policy errors into the default message for weak passwords', async () => {
    const errors = await validate(
      buildDto({
        email: 'jane@example.com',
        name: 'Jane Doe',
        password: 'short',
      }),
    );

    expect(errors).toHaveLength(1);
    const message = Object.values(errors[0]!.constraints ?? {}).join(' ');
    expect(message).toMatch(/at least 12 characters/);
    expect(message).toMatch(/uppercase/);
    expect(message).toMatch(/number/);
  });

  it('flags passwords that contain the user name', async () => {
    const errors = await validate(
      buildDto({
        email: 'jane@example.com',
        name: 'Jane Doe',
        password: 'JaneStrongPwd1!',
      }),
    );

    expect(errors).toHaveLength(1);
    const message = Object.values(errors[0]!.constraints ?? {}).join(' ');
    expect(message).toMatch(/name or email/);
  });
});
