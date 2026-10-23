import { z } from 'zod';
import { dateTimeSchema } from '../common.ts';
import { envelopeFields } from '../ws/envelope.ts';
import { telemetryPayloadSchema } from '../ws/telemetry.ts';

const presencePayloadSchema = z.object({
  robotId: z.uuid(),
  at: dateTimeSchema.describe('When the cloud saw the change'),
});

export const liveRobotOnlineSchema = z.object({
  type: z.literal('robot.online'),
  ...envelopeFields,
  payload: presencePayloadSchema,
});

export const liveRobotOfflineSchema = z.object({
  type: z.literal('robot.offline'),
  ...envelopeFields,
  payload: presencePayloadSchema,
});

export const liveRobotTelemetrySchema = z.object({
  type: z.literal('robot.telemetry'),
  ...envelopeFields,
  payload: z.object({
    robotId: z.uuid(),
    at: dateTimeSchema.describe('When the cloud received it'),
    telemetry: telemetryPayloadSchema,
  }),
});

// Events of the robots in the viewer's scope; the panel ignores types it does not know.
export const liveEventSchema = z.discriminatedUnion('type', [
  liveRobotOnlineSchema,
  liveRobotOfflineSchema,
  liveRobotTelemetrySchema,
]);

export type LiveRobotOnline = z.infer<typeof liveRobotOnlineSchema>;
export type LiveRobotOffline = z.infer<typeof liveRobotOfflineSchema>;
export type LiveRobotTelemetry = z.infer<typeof liveRobotTelemetrySchema>;
export type LiveEvent = z.infer<typeof liveEventSchema>;
