import { PrismaService } from '@shared/database/prisma.service';
import { PrismaPasswordResetTokensRepository } from './prisma-password-reset-tokens.repository';

type Client = {
  create: jest.Mock;
  findUnique: jest.Mock;
  update: jest.Mock;
  deleteMany: jest.Mock;
};

describe('PrismaPasswordResetTokensRepository', () => {
  let prisma: { passwordResetToken: Client };
  let repo: PrismaPasswordResetTokensRepository;

  const baseRow = {
    id: 't1',
    userId: 'u1',
    tokenHash: 'h',
    expiresAt: new Date('2026-01-02'),
    usedAt: null,
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    prisma = {
      passwordResetToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    repo = new PrismaPasswordResetTokensRepository(prisma as unknown as PrismaService);
  });

  it('create persists data', async () => {
    prisma.passwordResetToken.create.mockResolvedValue(baseRow);
    const result = await repo.create({
      userId: 'u1',
      tokenHash: 'h',
      expiresAt: baseRow.expiresAt,
    });
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: { userId: 'u1', tokenHash: 'h', expiresAt: baseRow.expiresAt },
    });
    expect(result).toEqual(baseRow);
  });

  it('findByTokenHash queries by unique hash and returns null on miss', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(baseRow);
    expect(await repo.findByTokenHash('h')).toEqual(baseRow);
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);
    expect(await repo.findByTokenHash('miss')).toBeNull();
  });

  it('markUsed sets usedAt', async () => {
    prisma.passwordResetToken.update.mockResolvedValue(baseRow);
    await repo.markUsed('t1');
    const arg = prisma.passwordResetToken.update.mock.calls[0][0] as {
      where: { id: string };
      data: { usedAt: Date };
    };
    expect(arg.where).toEqual({ id: 't1' });
    expect(arg.data.usedAt).toBeInstanceOf(Date);
  });

  it('deletePendingForUser scopes to user + unused', async () => {
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    await repo.deletePendingForUser('u1');
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', usedAt: null },
    });
  });

  it('deleteExpired removes tokens whose expiresAt is below the cutoff', async () => {
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 9 });
    const cutoff = new Date('2026-04-01');
    const deleted = await repo.deleteExpired(cutoff);
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: cutoff } },
    });
    expect(deleted).toBe(9);
  });
});
