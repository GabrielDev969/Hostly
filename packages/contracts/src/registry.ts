import {
  liveEventSchema,
  liveRobotOfflineSchema,
  liveRobotOnlineSchema,
  liveRobotTelemetrySchema,
} from './live/events.ts';
import { mapPointsRequestSchema, mapPointsResponseSchema } from './map-points.ts';
import {
  pairPollRequestSchema,
  pairPollResponseSchema,
  pairStartRequestSchema,
  pairStartResponseSchema,
} from './pairing.ts';
import { helloMessageSchema } from './ws/hello.ts';
import { cloudToRobotMessageSchema, robotToCloudMessageSchema } from './ws/messages.ts';
import { pingMessageSchema, pongMessageSchema } from './ws/ping-pong.ts';
import { telemetryMessageSchema } from './ws/telemetry.ts';

// Each name is a file in schemas/ and a folder in fixtures/.
export const contractSchemas = {
  'pair-start.request': pairStartRequestSchema,
  'pair-start.response': pairStartResponseSchema,
  'pair-poll.request': pairPollRequestSchema,
  'pair-poll.response': pairPollResponseSchema,
  'map-points.request': mapPointsRequestSchema,
  'map-points.response': mapPointsResponseSchema,
  'ws.hello': helloMessageSchema,
  'ws.telemetry': telemetryMessageSchema,
  'ws.ping': pingMessageSchema,
  'ws.pong': pongMessageSchema,
  'ws.robot-to-cloud': robotToCloudMessageSchema,
  'ws.cloud-to-robot': cloudToRobotMessageSchema,
  'live.robot-online': liveRobotOnlineSchema,
  'live.robot-offline': liveRobotOfflineSchema,
  'live.robot-telemetry': liveRobotTelemetrySchema,
  'live.event': liveEventSchema,
};

export type ContractName = keyof typeof contractSchemas;
