import { liveEventSchema } from '@hostly/contracts';
import { canSee, InMemoryLiveEventBus, liveEvents, type RobotLiveEvent } from './live-event-bus';
import type { LiveViewer } from '../entities/live-viewer.entity';

const ROBOT = '6c1d7f8e-2a3b-4c5d-8e9f-0a1b2c3d4e5f';
const event = (organizationId: string, clientId: string): RobotLiveEvent => ({
  organizationId,
  clientId,
  event: liveEvents.online(ROBOT, new Date()),
});
const viewer = (organizationId: string, clientId: string | null): LiveViewer => ({
  userId: 'u1',
  organizationId,
  workspaceId: 'w1',
  clientId,
});

describe('canSee', () => {
  it('lets the operator see every robot of its organization and nothing else', () => {
    expect(canSee(viewer('o1', null), event('o1', 'cA'))).toBe(true);
    expect(canSee(viewer('o1', null), event('o1', 'cB'))).toBe(true);
    expect(canSee(viewer('o1', null), event('o2', 'cA'))).toBe(false);
  });

  it('lets a client user see only the robots its client has now', () => {
    expect(canSee(viewer('o1', 'cA'), event('o1', 'cA'))).toBe(true);
    expect(canSee(viewer('o1', 'cA'), event('o1', 'cB'))).toBe(false);
    expect(canSee(viewer('o2', 'cA'), event('o1', 'cA'))).toBe(false);
  });
});

describe('liveEvents', () => {
  it('builds events that follow the live contract', () => {
    const at = new Date();
    for (const built of [
      liveEvents.online(ROBOT, at),
      liveEvents.offline(ROBOT, at),
      liveEvents.telemetry(ROBOT, at, {
        battery: 50,
        charging: false,
        pose: null,
        mode: 'idle',
        nowPlaying: null,
        emergency: false,
      }),
    ]) {
      expect(liveEventSchema.safeParse(built).success).toBe(true);
    }
  });
});

describe('InMemoryLiveEventBus', () => {
  it('delivers to subscribers until they unsubscribe', () => {
    const bus = new InMemoryLiveEventBus();
    const listener = jest.fn();
    const unsubscribe = bus.subscribe(listener);

    bus.publish(event('o1', 'cA'));
    unsubscribe();
    bus.publish(event('o1', 'cA'));

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
