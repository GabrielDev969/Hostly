import { z } from 'zod';
import { poseSchema } from '../common.ts';
import { envelopeFields } from './envelope.ts';

export const robotModeSchema = z.enum([
  'idle',
  'promotion',
  'cruise',
  'guide',
  'reception',
  'base',
  'suspended',
]);

export const telemetryPayloadSchema = z.object({
  battery: z
    .int()
    .min(0)
    .max(100)
    .nullable()
    .describe('Battery level in percent; null when the robot does not report it'),
  charging: z.boolean().nullable(),
  pose: poseSchema.nullable().describe('Null when the robot is not localized'),
  mode: robotModeSchema,
  nowPlaying: z
    .object({
      assetId: z.uuid(),
    })
    .nullable(),
  emergency: z.boolean(),
});

export const telemetryMessageSchema = z.object({
  type: z.literal('telemetry'),
  ...envelopeFields,
  payload: telemetryPayloadSchema,
});

export type RobotMode = z.infer<typeof robotModeSchema>;
export type TelemetryPayload = z.infer<typeof telemetryPayloadSchema>;
export type TelemetryMessage = z.infer<typeof telemetryMessageSchema>;
