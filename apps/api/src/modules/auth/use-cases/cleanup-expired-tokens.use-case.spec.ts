import { CleanupExpiredTokensUseCase } from './cleanup-expired-tokens.use-case';
import { EmailVerifyTokensRepository } from '../repositories/email-verify-tokens.repository.interface';
import { PasswordResetTokensRepository } from '../repositories/password-reset-tokens.repository.interface';
import { env } from 'src/config/env.config';

describe('CleanupExpiredTokensUseCase', () => {
  function setup(emailDeleted: number, passwordDeleted: number) {
    const emailVerify = {
      deleteExpired: jest.fn().mockResolvedValue(emailDeleted),
    } as unknown as jest.Mocked<EmailVerifyTokensRepository>;
    const passwordReset = {
      deleteExpired: jest.fn().mockResolvedValue(passwordDeleted),
    } as unknown as jest.Mocked<PasswordResetTokensRepository>;
    return {
      useCase: new CleanupExpiredTokensUseCase(emailVerify, passwordReset),
      emailVerify,
      passwordReset,
    };
  }

  it('passes the same cutoff (now - retention) to both repositories', async () => {
    const { useCase, emailVerify, passwordReset } = setup(2, 3);
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const result = await useCase.execute();

    const expectedCutoff = new Date(now - env.EPHEMERAL_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    expect(emailVerify.deleteExpired).toHaveBeenCalledWith(expectedCutoff);
    expect(passwordReset.deleteExpired).toHaveBeenCalledWith(expectedCutoff);
    expect(result).toEqual({ emailVerify: 2, passwordReset: 3 });
  });

  it('returns zeros when no rows match', async () => {
    const { useCase } = setup(0, 0);
    expect(await useCase.execute()).toEqual({
      emailVerify: 0,
      passwordReset: 0,
    });
  });
});
