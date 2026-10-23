import { Injectable } from '@nestjs/common';
import type { LiveEvent, TelemetryPayload } from '@hostly/contracts';
import { LiveViewer } from '../entities/live-viewer.entity';

// An event about one robot, tagged with the tenant the robot belongs to at that moment.
export interface RobotLiveEvent {
  organizationId: string;
  clientId: string;
  event: LiveEvent;
}

export type LiveListener = (event: RobotLiveEvent) => void;

// One API instance in v1: events stay in memory. With more instances this becomes a Redis pub/sub.
export abstract class LiveEventBus {
  abstract publish(event: RobotLiveEvent): void;
  // Returns the unsubscribe function.
  abstract subscribe(listener: LiveListener): () => void;
}

@Injectable()
export class InMemoryLiveEventBus extends LiveEventBus {
  private readonly listeners = new Set<LiveListener>();

  constructor() {
    super();
  }

  publish(event: RobotLiveEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: LiveListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

// The operator sees every robot of its organization; a client user only the robots the client has now.
export function canSee(viewer: LiveViewer, event: RobotLiveEvent): boolean {
  return (
    viewer.organizationId === event.organizationId &&
    (viewer.clientId === null || viewer.clientId === event.clientId)
  );
}

const iso = (at: Date) => at.toISOString();

export const liveEvents = {
  online: (robotId: string, at: Date): LiveEvent => ({
    type: 'robot.online',
    sentAt: iso(new Date()),
    payload: { robotId, at: iso(at) },
  }),
  offline: (robotId: string, at: Date): LiveEvent => ({
    type: 'robot.offline',
    sentAt: iso(new Date()),
    payload: { robotId, at: iso(at) },
  }),
  telemetry: (robotId: string, at: Date, telemetry: TelemetryPayload): LiveEvent => ({
    type: 'robot.telemetry',
    sentAt: iso(new Date()),
    payload: { robotId, at: iso(at), telemetry },
  }),
};
