import { PrismaService } from '@shared/database/prisma.service';
import { PrismaEmailVerifyTokensRepository } from './prisma-email-verify-tokens.repository';

type Client = {
  create: jest.Mock;
  findUnique: jest.Mock;
  update: jest.Mock;
  deleteMany: jest.Mock;
};

describe('PrismaEmailVerifyTokensRepository', () => {
  let prisma: { emailVerifyToken: Client };
  let repo: PrismaEmailVerifyTokensRepository;

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
      emailVerifyToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    repo = new PrismaEmailVerifyTokensRepository(prisma as unknown as PrismaService);
  });

  it('create persists data', async () => {
    prisma.emailVerifyToken.create.mockResolvedValue(baseRow);
    const result = await repo.create({
      userId: 'u1',
      tokenHash: 'h',
      expiresAt: baseRow.expiresAt,
    });
    expect(prisma.emailVerifyToken.create).toHaveBeenCalledWith({
      data: { userId: 'u1', tokenHash: 'h', expiresAt: baseRow.expiresAt },
    });
    expect(result).toEqual(baseRow);
  });

  it('findByTokenHash queries by unique hash', async () => {
    prisma.emailVerifyToken.findUnique.mockResolvedValue(baseRow);
    expect(await repo.findByTokenHash('h')).toEqual(baseRow);
    expect(prisma.emailVerifyToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: 'h' },
    });
  });

  it('findByTokenHash returns null when missing', async () => {
    prisma.emailVerifyToken.findUnique.mockResolvedValue(null);
    expect(await repo.findByTokenHash('miss')).toBeNull();
  });

  it('markUsed sets usedAt to now', async () => {
    prisma.emailVerifyToken.update.mockResolvedValue(baseRow);
    await repo.markUsed('t1');
    const arg = prisma.emailVerifyToken.update.mock.calls[0][0] as {
      where: { id: string };
      data: { usedAt: Date };
    };
    expect(arg.where).toEqual({ id: 't1' });
    expect(arg.data.usedAt).toBeInstanceOf(Date);
  });

  it('deletePendingForUser scopes to user + unused', async () => {
    prisma.emailVerifyToken.deleteMany.mockResolvedValue({ count: 2 });
    await repo.deletePendingForUser('u1');
    expect(prisma.emailVerifyToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', usedAt: null },
    });
  });

  it('deleteExpired removes tokens whose expiresAt is below the cutoff', async () => {
    prisma.emailVerifyToken.deleteMany.mockResolvedValue({ count: 4 });
    const cutoff = new Date('2026-04-01');
    const deleted = await repo.deleteExpired(cutoff);
    expect(prisma.emailVerifyToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: cutoff } },
    });
    expect(deleted).toBe(4);
  });
});
