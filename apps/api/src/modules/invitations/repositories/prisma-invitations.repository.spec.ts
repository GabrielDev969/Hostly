import { PrismaService } from '@shared/database/prisma.service';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import { PrismaInvitationsRepository } from './prisma-invitations.repository';

type InvitationClient = {
  create: jest.Mock;
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

type PrismaMock = {
  invitation: InvitationClient;
  client: { updateMany: jest.Mock };
  $transaction: jest.Mock;
};

describe('PrismaInvitationsRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaInvitationsRepository;

  const baseRow = {
    id: 'inv1',
    email: 'jane@example.com',
    workspaceId: 'w1',
    roleId: 'r1',
    invitedById: 'u1',
    clientId: null,
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
      client: { updateMany: jest.fn() },
      $transaction: jest.fn((work: (tx: PrismaMock) => Promise<unknown>) => work(prisma)),
    };
    // One mock serves both clients: the scope filter itself is covered by the rewriter specs.
    repo = new PrismaInvitationsRepository(
      prisma as unknown as PrismaService,
      {
        client: prisma,
      } as unknown as ScopedPrismaService,
    );
  });

  describe('create', () => {
    it('persists and returns mapped entity', async () => {
      prisma.invitation.create.mockResolvedValue(baseRow);

      const result = await repo.create({
        email: 'jane@example.com',
        workspaceId: 'w1',
        roleId: 'r1',
        invitedById: 'u1',
        clientId: null,
        tokenHash: 'hash',
        expiresAt: baseRow.expiresAt,
      });

      expect(prisma.invitation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'jane@example.com' }),
      });
      expect(result?.id).toBe('inv1');
      expect(prisma.client.updateMany).not.toHaveBeenCalled();
    });

    const toClient = {
      email: 'jane@example.com',
      workspaceId: 'w1',
      roleId: 'r1',
      invitedById: 'u1',
      clientId: 'c1',
      tokenHash: 'hash',
      expiresAt: baseRow.expiresAt,
    };

    it('locks a live client before inviting to it', async () => {
      prisma.client.updateMany.mockResolvedValue({ count: 1 });
      prisma.invitation.create.mockResolvedValue({ ...baseRow, clientId: 'c1' });

      const result = await repo.create(toClient);

      expect(prisma.client.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1', deletedAt: null },
        data: { updatedAt: expect.any(Date) },
      });
      expect(result?.clientId).toBe('c1');
    });

    it('returns null and creates nothing when the client is gone', async () => {
      prisma.client.updateMany.mockResolvedValue({ count: 0 });

      await expect(repo.create(toClient)).resolves.toBeNull();
      expect(prisma.invitation.create).not.toHaveBeenCalled();
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
