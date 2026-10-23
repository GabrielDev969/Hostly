import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { robotKeys } from '../queries';
import { applyLiveEvent, applyToRobot } from './apply-live-event';
import { backoffDelay, LIVE_BACKOFF } from './backoff';
import { parseLiveEvent } from './live-connection';
import { WORKSPACE_ID } from '../../../../test/fixtures';
import {
  presenceEvent,
  ROBOT_A,
  ROBOT_B,
  robotFixture,
  telemetryEvent,
} from '../../../../test/robots';

const LATER = '2026-06-01T00:00:00.000Z';
const EARLIER = '2025-06-01T00:00:00.000Z';

describe('applyToRobot', () => {
  it('takes the telemetry, its time as the last contact and marks the robot online', () => {
    const robot = applyToRobot(
      robotFixture({ online: false }),
      telemetryEvent(ROBOT_A, 12, {}, LATER),
    );
    expect(robot).toMatchObject({
      online: true,
      lastSeenAt: LATER,
      telemetry: { at: LATER, battery: 12 },
    });
  });

  it('drops events older than what it already holds', () => {
    const robot = robotFixture();
    expect(applyToRobot(robot, telemetryEvent(ROBOT_A, 12, {}, EARLIER))).toBe(robot);
    expect(applyToRobot(robot, presenceEvent('robot.offline', ROBOT_A, EARLIER))).toBe(robot);
  });

  it('turns online and offline', () => {
    expect(
      applyToRobot(robotFixture(), presenceEvent('robot.offline', ROBOT_A, LATER)).online,
    ).toBe(false);
    expect(
      applyToRobot(robotFixture({ online: false }), presenceEvent('robot.online', ROBOT_A, LATER)),
    ).toMatchObject({ online: true, lastSeenAt: LATER });
  });
});

describe('applyLiveEvent', () => {
  const setup = () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(robotKeys.list(WORKSPACE_ID, null), [robotFixture()]);
    queryClient.setQueryData(robotKeys.detail(WORKSPACE_ID, ROBOT_A), robotFixture());
    return queryClient;
  };

  it('updates every list and the detail of the robot', () => {
    const queryClient = setup();
    applyLiveEvent(queryClient, WORKSPACE_ID, telemetryEvent(ROBOT_A, 5, {}, LATER));
    expect(
      queryClient.getQueryData<{ telemetry: { battery: number } }[]>(
        robotKeys.list(WORKSPACE_ID, null),
      )?.[0]?.telemetry.battery,
    ).toBe(5);
    expect(
      queryClient.getQueryData<{ telemetry: { battery: number } }>(
        robotKeys.detail(WORKSPACE_ID, ROBOT_A),
      )?.telemetry.battery,
    ).toBe(5);
  });

  it('reloads the lists when an unknown robot comes online, but not for its telemetry', () => {
    const queryClient = setup();
    applyLiveEvent(queryClient, WORKSPACE_ID, telemetryEvent(ROBOT_B, 5, {}, LATER));
    expect(queryClient.getQueryState(robotKeys.list(WORKSPACE_ID, null))?.isInvalidated).toBe(
      false,
    );

    applyLiveEvent(queryClient, WORKSPACE_ID, presenceEvent('robot.online', ROBOT_B, LATER));
    expect(queryClient.getQueryState(robotKeys.list(WORKSPACE_ID, null))?.isInvalidated).toBe(true);
  });
});

describe('parseLiveEvent', () => {
  it('accepts a valid event and refuses everything else', () => {
    expect(parseLiveEvent(JSON.stringify(telemetryEvent(ROBOT_A, 5)))?.type).toBe(
      'robot.telemetry',
    );
    expect(parseLiveEvent('{')).toBeNull();
    expect(parseLiveEvent(new ArrayBuffer(2))).toBeNull();
    expect(parseLiveEvent(JSON.stringify({ type: 'robot.renamed', payload: {} }))).toBeNull();
  });
});

describe('backoffDelay', () => {
  it('doubles from 1 s up to the 30 s ceiling', () => {
    const middle = () => 0.5;
    expect([0, 1, 2, 3, 4, 5, 6, 20].map((attempt) => backoffDelay(attempt, middle))).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });

  it('spreads each wait by up to 20% and never goes past the ceiling', () => {
    expect(backoffDelay(0, () => 0)).toBe(800);
    expect(backoffDelay(0, () => 1)).toBe(1_200);
    expect(backoffDelay(10, () => 1)).toBe(LIVE_BACKOFF.maxMs);
  });
});
