import { InMemoryRobotConnectionRegistry } from './robot-connection-registry';
import type { RobotConnection } from './robot-connection';

describe('InMemoryRobotConnectionRegistry', () => {
  const first = { id: 1 } as unknown as RobotConnection;
  const second = { id: 2 } as unknown as RobotConnection;

  it('hands back the connection a newer one replaced', () => {
    const registry = new InMemoryRobotConnectionRegistry();
    expect(registry.register('r1', first)).toBeNull();
    expect(registry.register('r1', first)).toBeNull();
    expect(registry.register('r1', second)).toBe(first);
  });

  it('unregisters only the current connection, so a replaced one does not take the robot offline', () => {
    const registry = new InMemoryRobotConnectionRegistry();
    registry.register('r1', first);
    registry.register('r1', second);

    expect(registry.unregister('r1', first)).toBe(false);
    expect(registry.unregister('r1', second)).toBe(true);
    expect(registry.unregister('r1', second)).toBe(false);
  });
});
