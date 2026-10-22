import { ForgotPasswordUseCase } from './forgot-password.use-case';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { PasswordResetTokensRepository } from '../repositories/password-reset-tokens.repository.interface';
import { EmailDispatcher } from '@shared/mailer/email-dispatcher.service';
import type { User } from '@modules/users/entities/user.entity';

describe('ForgotPasswordUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let tokens: jest.Mocked<PasswordResetTokensRepository>;
  let emailDispatcher: jest.Mocked<EmailDispatcher>;
  let useCase: ForgotPasswordUseCase;

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    tokens = {
      create: jest.fn(),
      deletePendingForUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PasswordResetTokensRepository>;
    emailDispatcher = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailDispatcher>;
    useCase = new ForgotPasswordUseCase(users, tokens, emailDispatcher);
  });

  it('returns silently for unknown email (no enumeration)', async () => {
    users.findByEmail.mockResolvedValue(null);
    await useCase.execute('ghost@example.com');
    expect(emailDispatcher.enqueue).not.toHaveBeenCalled();
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('sends the reset email to OAuth-only users so they can set a password', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      name: 'Jane',
      passwordHash: null,
    } as User);
    await useCase.execute('a@b.c');
    expect(tokens.deletePendingForUser).toHaveBeenCalledWith('u1');
    expect(tokens.create).toHaveBeenCalled();
    expect(emailDispatcher.enqueue).toHaveBeenCalled();
    expect(emailDispatcher.enqueue.mock.calls[0]![0].to).toBe('a@b.c');
  });

  it('creates a token and enqueues the reset email', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      name: 'Jane',
      passwordHash: 'h',
    } as User);
    await useCase.execute('a@b.c');
    expect(tokens.deletePendingForUser).toHaveBeenCalledWith('u1');
    const createArg = tokens.create.mock.calls[0]![0];
    expect(createArg.userId).toBe('u1');
    expect(createArg.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const ttlMs = createArg.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(59 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(60 * 60 * 1000);
    expect(emailDispatcher.enqueue).toHaveBeenCalled();
    expect(emailDispatcher.enqueue.mock.calls[0]![0].to).toBe('a@b.c');
  });
});
