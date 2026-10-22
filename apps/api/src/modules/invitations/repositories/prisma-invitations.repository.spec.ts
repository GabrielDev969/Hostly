import { PrismaService } from '@shared/database/prisma.service';
import { PrismaInvitationsRepository } from './prisma-invitations.repository';

type InvitationClient = {
  create: jest.Mock;
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

type PrismaMock = { invitation: InvitationClient };

describe('PrismaInvitationsRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaInvitationsRepository;

  const baseRow = {
    id: 'inv1',
    email: 'jane@example.com',
    workspaceId: 'w1',
    roleId: 'r1',
    invitedById: 'u1',
    tokenHash: 'hash',
    expiresAt: new Date('2026-12-31'),
    acceptedAt: null,
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    prisma = {
      invitation: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    repo = new PrismaInvitationsRepository(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('persists and returns mapped entity', async () => {
      prisma.invitation.create.mockResolvedValue(baseRow);

      const result = await repo.create({
        email: 'jane@example.com',
        workspaceId: 'w1',
        roleId: 'r1',
        invitedById: 'u1',
        tokenHash: 'hash',
        expiresAt: baseRow.expiresAt,
      });

      expect(prisma.invitation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'jane@example.com' }),
      });
      expect(result.id).toBe('inv1');
    });
  });

  describe('findById', () => {
    it('returns mapped entity', async () => {
      prisma.invitation.findUnique.mockResolvedValue(baseRow);
      const result = await repo.findById('inv1');
      expect(prisma.invitation.findUnique).toHaveBeenCalledWith({
        where: { id: 'inv1' },
      });
      expect(result?.id).toBe('inv1');
    });

    it('returns null when not found', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);
      expect(await repo.findById('missing')).toBeNull();
    });
  });

  describe('findByTokenHash', () => {
    it('returns mapped entity', async () => {
      prisma.invitation.findUnique.mockResolvedValue(baseRow);
      const result = await repo.findByTokenHash('hash');
      expect(prisma.invitation.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: 'hash' },
      });
      expect(result?.tokenHash).toBe('hash');
    });

    it('returns null when not found', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);
      expect(await repo.findByTokenHash('missing')).toBeNull();
    });
  });

  describe('findManyByWorkspace', () => {
    it('returns mapped items ordered by createdAt desc', async () => {
      prisma.invitation.findMany.mockResolvedValue([baseRow]);
      const result = await repo.findManyByWorkspace('w1');
      expect(prisma.invitation.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'w1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('inv1');
    });

    it('returns empty array when none', async () => {
      prisma.invitation.findMany.mockResolvedValue([]);
      expect(await repo.findManyByWorkspace('w1')).toEqual([]);
    });
  });

  describe('findPendingByEmailAndWorkspace', () => {
    it('returns the pending invitation', async () => {
      prisma.invitation.findFirst.mockResolvedValue(baseRow);

      const result = await repo.findPendingByEmailAndWorkspace('jane@example.com', 'w1');

      const args = prisma.invitation.findFirst.mock.calls[0][0] as {
        where: {
          email: string;
          workspaceId: string;
          acceptedAt: null;
          expiresAt: { gt: Date };
        };
      };
      expect(args.where.email).toBe('jane@example.com');
      expect(args.where.workspaceId).toBe('w1');
      expect(args.where.acceptedAt).toBeNull();
      expect(args.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(result?.id).toBe('inv1');
    });

    it('returns null when none', async () => {
      prisma.invitation.findFirst.mockResolvedValue(null);
      expect(await repo.findPendingByEmailAndWorkspace('x@x.com', 'w1')).toBeNull();
    });
  });

  describe('markAsAccepted', () => {
    it('updates acceptedAt with a Date', async () => {
      prisma.invitation.update.mockResolvedValue(baseRow);

      await repo.markAsAccepted('inv1');

      const args = prisma.invitation.update.mock.calls[0][0] as {
        where: { id: string };
        data: { acceptedAt: Date };
      };
      expect(args.where).toEqual({ id: 'inv1' });
      expect(args.data.acceptedAt).toBeInstanceOf(Date);
    });
  });

  describe('delete', () => {
    it('removes by id', async () => {
      prisma.invitation.delete.mockResolvedValue(baseRow);
      await repo.delete('inv1');
      expect(prisma.invitation.delete).toHaveBeenCalledWith({
        where: { id: 'inv1' },
      });
    });
  });
});
