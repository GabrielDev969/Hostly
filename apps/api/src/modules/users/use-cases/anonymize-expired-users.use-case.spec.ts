import {
  AnonymizeExpiredUsersUseCase,
  ANONYMIZATION_GRACE_DAYS,
} from './anonymize-expired-users.use-case';
import { UsersRepository } from '../repositories/users.repository.interface';
import type { User } from '../entities/user.entity';

describe('AnonymizeExpiredUsersUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let useCase: AnonymizeExpiredUsersUseCase;

  beforeEach(() => {
    users = {
      findPendingAnonymization: jest.fn(),
      anonymize: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    useCase = new AnonymizeExpiredUsersUseCase(users);
  });

  it('returns zero and skips anonymize when nothing is expired', async () => {
    users.findPendingAnonymization.mockResolvedValue([]);
    const result = await useCase.execute();
    expect(result).toEqual({ anonymized: 0 });
    expect(users.anonymize).not.toHaveBeenCalled();
  });

  it('calls anonymize for each expired user and uses a cutoff of GRACE_DAYS ago', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    users.findPendingAnonymization.mockResolvedValue([{ id: 'u1' } as User, { id: 'u2' } as User]);
    users.anonymize.mockResolvedValue(undefined);

    const result = await useCase.execute();

    expect(users.findPendingAnonymization).toHaveBeenCalledTimes(1);
    const cutoff = users.findPendingAnonymization.mock.calls[0]![0];
    const expected = new Date(now - ANONYMIZATION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    expect(cutoff.getTime()).toBe(expected.getTime());

    expect(users.anonymize).toHaveBeenCalledWith('u1');
    expect(users.anonymize).toHaveBeenCalledWith('u2');
    expect(result).toEqual({ anonymized: 2 });
  });

  it('continues processing remaining users when one anonymize throws', async () => {
    users.findPendingAnonymization.mockResolvedValue([
      { id: 'u1' } as User,
      { id: 'u2' } as User,
      { id: 'u3' } as User,
    ]);
    users.anonymize
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    const result = await useCase.execute();

    expect(users.anonymize).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ anonymized: 2 });
  });
});
