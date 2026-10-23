import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SitesRepository } from '@modules/sites/repositories/sites.repository.interface';
import { ApprovePairingUseCase, DELIVERY_GRACE_MS } from './approve-pairing.use-case';
import { RobotPairingsRepository } from '../repositories/robot-pairings.repository.interface';
import { PairingCodesService } from '../services/pairing-codes.service';
import { RobotPairing } from '../entities/robot-pairing.entity';
import { Robot } from '../entities/robot.entity';

describe('ApprovePairingUseCase', () => {
  let codes: jest.Mocked<Pick<PairingCodesService, 'findPending'>>;
  let pairings: jest.Mocked<RobotPairingsRepository>;
  let sites: jest.Mocked<SitesRepository>;
  let useCase: ApprovePairingUseCase;

  const robot = { id: 'r1', serial: 'LB-01', clientId: 'c2', siteId: 's2' } as Robot;
  const pairing = (expiresInMs: number): RobotPairing => ({
    id: 'p1',
    serial: 'LB-01',
    code: '123456',
    status: 'pending',
    robotId: null,
    expiresAt: new Date(Date.now() + expiresInMs),
    createdAt: new Date(),
  });
  const input = { userId: 'u1', code: '123456', siteId: 's2', permissions: ['robot:pair'] };
  const existing = (overrides: Partial<Robot> = {}): Robot => ({
    ...robot,
    name: 'Robot L2',
    status: 'revoked',
    ...overrides,
  });
  // Runs the authorization the repository runs inside its transaction, on this robot.
  const approvingExisting = (found: Robot) =>
    pairings.approve.mockImplementation((data) => {
      data.authorizeExisting(found);
      return Promise.resolve({ status: 'approved', robot: found });
    });

  beforeEach(() => {
    codes = { findPending: jest.fn().mockResolvedValue(pairing(5 * 60_000)) };
    pairings = {
      deleteExpired: jest.fn(),
      create: jest.fn(),
      findPendingByCode: jest.fn(),
      findByPollKeyHash: jest.fn(),
      approve: jest.fn().mockResolvedValue({ status: 'approved', robot }),
      claimApproved: jest.fn(),
    };
    sites = {
      findMany: jest.fn(),
      findById: jest.fn().mockResolvedValue({ id: 's2', clientId: 'c2' }),
      create: jest.fn(),
      update: jest.fn(),
      softDeleteUnlessUsed: jest.fn(),
    };
    useCase = new ApprovePairingUseCase(codes as unknown as PairingCodesService, pairings, sites);
  });

  it('approves into the site, with the client of the site', async () => {
    const result = await useCase.execute({ ...input, name: 'Robot L2' });

    expect(codes.findPending).toHaveBeenCalledWith('u1', '123456');
    expect(pairings.approve).toHaveBeenCalledWith(
      expect.objectContaining({
        pairingId: 'p1',
        serial: 'LB-01',
        siteId: 's2',
        clientId: 'c2',
        name: 'Robot L2',
      }),
    );
    expect(result).toMatchObject({ id: 'r1', siteId: 's2' });
    expect(result).not.toHaveProperty('deviceTokenHash');
  });

  it('keeps the code validity when there is time left', async () => {
    const found = pairing(5 * 60_000);
    codes.findPending.mockResolvedValue(found);

    await useCase.execute(input);

    expect(pairings.approve.mock.calls[0]![0].expiresAt).toEqual(found.expiresAt);
  });

  it('leaves at least a minute to fetch the token when approved near expiry', async () => {
    codes.findPending.mockResolvedValue(pairing(5_000));
    const before = Date.now();

    await useCase.execute(input);

    const expiresAt = pairings.approve.mock.calls[0]![0].expiresAt.getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + DELIVERY_GRACE_MS);
  });

  it('throws 404 for a site out of scope or deleted', async () => {
    sites.findById.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(NotFoundException);
    expect(pairings.approve).not.toHaveBeenCalled();
  });

  it('throws 404 when the site is deleted while the pairing is being approved', async () => {
    pairings.approve.mockResolvedValue({ status: 'site_gone' });

    await expect(useCase.execute(input)).rejects.toThrow(new NotFoundException('Site not found'));
  });

  it('throws 409 without naming the owner when the serial belongs to another organization', async () => {
    pairings.approve.mockResolvedValue({ status: 'serial_taken' });

    await expect(useCase.execute(input)).rejects.toThrow(
      new ConflictException('This robot is registered to another organization'),
    );
  });

  it('throws 409 when the pairing was approved meanwhile', async () => {
    pairings.approve.mockResolvedValue({ status: 'not_pending' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ConflictException);
  });

  describe('pairing an existing robot again', () => {
    it('needs nothing beyond robot:pair when it is not active and nothing else changes', async () => {
      approvingExisting(existing());

      await expect(useCase.execute({ ...input, name: 'Robot L2' })).resolves.toMatchObject({
        id: 'r1',
      });
    });

    it.each([
      ['robot:revoke', 'an active robot', existing({ status: 'active' }), {}],
      ['robot:move', 'another site', existing({ siteId: 's1' }), {}],
      ['robot:update', 'another name', existing(), { name: 'Robot L3' }],
    ])('requires %s for %s', async (permission, _, found, extra) => {
      approvingExisting(found);

      await expect(useCase.execute({ ...input, ...extra })).rejects.toThrow(
        expect.objectContaining({ message: expect.stringContaining(permission) }) as Error,
      );
      await expect(useCase.execute({ ...input, ...extra })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        useCase.execute({ ...input, ...extra, permissions: ['robot:pair', permission] }),
      ).resolves.toMatchObject({ id: 'r1' });
    });

    it('lists every missing permission at once', async () => {
      approvingExisting(existing({ status: 'active', siteId: 's1' }));

      await expect(useCase.execute({ ...input, name: 'Robot L3' })).rejects.toThrow(
        new ForbiddenException(
          'Pairing this robot again requires robot:revoke (it is active and loses its token), robot:move (the site changes), robot:update (the name changes)',
        ),
      );
    });
  });
});
