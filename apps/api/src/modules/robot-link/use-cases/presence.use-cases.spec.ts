import type { TelemetryPayload } from '@hostly/contracts';
import { env } from 'src/config/env.config';
import { RobotAuthService } from '@modules/robots/services/robot-auth.service';
import { InMemoryLiveEventBus, type RobotLiveEvent } from '@modules/live/services/live-event-bus';
import { TenantContext } from '@shared/tenancy/tenant-context';
import type { TenantScope } from '@shared/tenancy/tenant-scope';
import { RobotPresenceRepository } from '../repositories/robot-presence.repository.interface';
import { RobotScopeService, type RobotSession } from '../services/robot-scope.service';
import { RecordRobotHelloUseCase } from './record-robot-hello.use-case';
import { RecordTelemetryUseCase } from './record-telemetry.use-case';
import { TouchRobotUseCase } from './touch-robot.use-case';
import { MarkRobotOfflineUseCase } from './mark-robot-offline.use-case';
import { SweepStaleRobotsUseCase } from './sweep-stale-robots.use-case';
import { CleanupOldTelemetryUseCase } from './cleanup-old-telemetry.use-case';

const session: RobotSession = {
  robotId: 'r1',
  serial: 'LB-01',
  organizationId: 'o1',
  workspaceId: 'w1',
  deviceTokenHash: 'hash',
};

const TELEMETRY: TelemetryPayload = {
  battery: 80,
  charging: false,
  pose: { x: 1, y: 2, theta: 0.5 },
  mode: 'cruise',
  nowPlaying: { assetId: 'c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f' },
  emergency: false,
};

const HELLO = {
  serial: 'LB-01',
  appVersion: '1.0.0',
  romVersion: 'rom-1',
  manifestVersion: null,
  contractVersion: 1,
};

describe('robot presence use cases', () => {
  let auth: jest.Mocked<Pick<RobotAuthService, 'authenticateHash'>>;
  let presence: jest.Mocked<RobotPresenceRepository>;
  let live: InMemoryLiveEventBus;
  let published: RobotLiveEvent[];
  let scopes: (TenantScope | null)[];
  let scope: RobotScopeService;

  const recordScope = () => {
    scopes.push(TenantContext.isSystem ? null : TenantContext.scope);
  };

  beforeEach(() => {
    auth = {
      authenticateHash: jest
        .fn()
        .mockResolvedValue({ id: 'r1', organizationId: 'o1', clientId: 'cA' }),
    };
    scopes = [];
    presence = {
      recordHello: jest.fn().mockImplementation(() => {
        recordScope();
        return Promise.resolve({ cameOnline: true });
      }),
      recordTelemetry: jest.fn().mockImplementation(() => {
        recordScope();
        return Promise.resolve({ cameOnline: false });
      }),
      touch: jest.fn().mockImplementation(() => {
        recordScope();
        return Promise.resolve({ cameOnline: false });
      }),
      markOffline: jest.fn().mockImplementation(() => {
        recordScope();
        return Promise.resolve({ robotId: 'r1', organizationId: 'o1', clientId: 'cB' });
      }),
      markStaleOffline: jest.fn().mockImplementation(() => {
        recordScope();
        return Promise.resolve([{ robotId: 'r2', organizationId: 'o1', clientId: 'cA' }]);
      }),
      deleteTelemetryOlderThan: jest.fn().mockResolvedValue(3),
    };
    live = new InMemoryLiveEventBus();
    published = [];
    live.subscribe((event) => published.push(event));
    scope = new RobotScopeService(auth as unknown as RobotAuthService);
  });

  it('records the hello in the robot scope and announces it online', async () => {
    await expect(
      new RecordRobotHelloUseCase(scope, presence, live).execute(session, HELLO),
    ).resolves.toBe(true);

    expect(auth.authenticateHash).toHaveBeenCalledWith('hash');
    expect(scopes).toEqual([
      { organizationId: 'o1', workspaceId: 'w1', clientId: 'cA', advertiserId: null },
    ]);
    expect(presence.recordHello).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ appVersion: '1.0.0', romVersion: 'rom-1', manifestVersion: null }),
    );
    expect(published).toEqual([
      expect.objectContaining({
        organizationId: 'o1',
        clientId: 'cA',
        event: expect.objectContaining({ type: 'robot.online' }),
      }),
    ]);
  });

  it('says false and writes nothing once the token stopped being valid', async () => {
    auth.authenticateHash.mockResolvedValue(null);

    await expect(
      new RecordTelemetryUseCase(scope, presence, live).execute(session, TELEMETRY),
    ).resolves.toBe(false);
    await expect(new TouchRobotUseCase(scope, presence, live).execute(session)).resolves.toBe(
      false,
    );
    expect(presence.recordTelemetry).not.toHaveBeenCalled();
    expect(presence.touch).not.toHaveBeenCalled();
    expect(published).toEqual([]);
  });

  it('records telemetry and sends it to the panel, with online first when the robot came back', async () => {
    presence.recordTelemetry.mockResolvedValueOnce({ cameOnline: true });

    await new RecordTelemetryUseCase(scope, presence, live).execute(session, TELEMETRY);

    expect(presence.recordTelemetry).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({
        battery: 80,
        mode: 'cruise',
        nowPlayingAssetId: TELEMETRY.nowPlaying!.assetId,
      }),
    );
    expect(published.map((e) => e.event.type)).toEqual(['robot.online', 'robot.telemetry']);
  });

  it('drops the telemetry of a robot moved while it was written', async () => {
    presence.recordTelemetry.mockResolvedValueOnce(null);

    await expect(
      new RecordTelemetryUseCase(scope, presence, live).execute(session, TELEMETRY),
    ).resolves.toBe(true);
    expect(published).toEqual([]);
  });

  it('announces online on a pong only when the robot came back', async () => {
    const touch = new TouchRobotUseCase(scope, presence, live);
    await touch.execute(session);
    presence.touch.mockResolvedValueOnce({ cameOnline: true });
    await touch.execute(session);

    expect(published.map((e) => e.event.type)).toEqual(['robot.online']);
  });

  it('marks offline in the organization scope, without the token, with the client from the row', async () => {
    await new MarkRobotOfflineUseCase(scope, presence, live).execute(session);

    expect(auth.authenticateHash).not.toHaveBeenCalled();
    expect(scopes).toEqual([
      { organizationId: 'o1', workspaceId: 'w1', clientId: null, advertiserId: null },
    ]);
    expect(published).toEqual([
      expect.objectContaining({
        clientId: 'cB',
        event: expect.objectContaining({ type: 'robot.offline' }),
      }),
    ]);
  });

  it('announces nothing when the robot was already offline', async () => {
    presence.markOffline.mockResolvedValueOnce(null);
    await new MarkRobotOfflineUseCase(scope, presence, live).execute(session);
    expect(published).toEqual([]);
  });

  it('sweeps stale robots as system work, older than the missed pings allow', async () => {
    const window = env.ROBOT_SOCKET_PING_INTERVAL_MS * env.ROBOT_SOCKET_MISSED_PINGS;
    const before = Date.now();
    await expect(new SweepStaleRobotsUseCase(presence, live).execute()).resolves.toBe(1);
    const after = Date.now();

    expect(scopes).toEqual([null]);
    const [seenBefore] = presence.markStaleOffline.mock.calls[0]!;
    expect(seenBefore.getTime()).toBeGreaterThanOrEqual(before - window);
    expect(seenBefore.getTime()).toBeLessThanOrEqual(after - window);
    expect(published).toEqual([
      expect.objectContaining({
        clientId: 'cA',
        event: expect.objectContaining({ type: 'robot.offline' }),
      }),
    ]);
  });

  it('prunes the telemetry history past the retention, as system work', async () => {
    let system = false;
    presence.deleteTelemetryOlderThan.mockImplementation(() => {
      system = TenantContext.isSystem;
      return Promise.resolve(3);
    });
    const retention = env.TELEMETRY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const before = Date.now();

    await expect(new CleanupOldTelemetryUseCase(presence).execute()).resolves.toEqual({
      deleted: 3,
    });
    const after = Date.now();

    const [cutoff] = presence.deleteTelemetryOlderThan.mock.calls[0]!;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - retention);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - retention);
    expect(system).toBe(true);
  });
});
