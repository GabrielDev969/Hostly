import {
  startTestDatabase,
  stopTestDatabase,
  resetDatabase,
  getPrisma,
} from './helpers/test-database';
import { createCache } from 'cache-manager';
import { PrismaUsersRepository } from '../src/modules/users/repositories/prisma-users.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { CacheService } from '../src/shared/cache/cache.service';

describe('PrismaUsersRepository (integration)', () => {
  let repo: PrismaUsersRepository;

  beforeAll(async () => {
    await startTestDatabase();
    repo = new PrismaUsersRepository(
      getPrisma() as unknown as PrismaService,
      new CacheService(createCache()),
    );
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('persists, fetches, updates and soft-deletes a user', async () => {
    const created = await repo.create({
      email: 'jane@example.com',
      name: 'Jane Doe',
      passwordHash: 'hash',
    });

    expect(created).toMatchObject({
      email: 'jane@example.com',
      name: 'Jane Doe',
      passwordHash: 'hash',
      twoFactorEnabled: false,
      deletedAt: null,
    });
    expect(created.id).toEqual(expect.any(String));

    const found = await repo.findById(created.id);
    expect(found?.id).toBe(created.id);

    const updated = await repo.update(created.id, {
      name: 'Jane Updated',
      twoFactorEnabled: true,
    });
    expect(updated.name).toBe('Jane Updated');
    expect(updated.twoFactorEnabled).toBe(true);

    await repo.softDelete(created.id);
    expect(await repo.findById(created.id)).toBeNull();

    const raw = await getPrisma().user.findUnique({
      where: { id: created.id },
    });
    expect(raw?.deletedAt).toBeInstanceOf(Date);
  });
});
