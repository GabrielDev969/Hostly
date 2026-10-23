import { z } from 'zod';
import { envelopeSchema } from './envelope.ts';
import { helloMessageSchema } from './hello.ts';
import { pingMessageSchema, pongMessageSchema } from './ping-pong.ts';
import { telemetryMessageSchema } from './telemetry.ts';

export const robotToCloudMessageSchema = z.discriminatedUnion('type', [
  helloMessageSchema,
  telemetryMessageSchema,
  pingMessageSchema,
  pongMessageSchema,
]);

export const cloudToRobotMessageSchema = z.discriminatedUnion('type', [
  pingMessageSchema,
  pongMessageSchema,
]);

export type RobotToCloudMessage = z.infer<typeof robotToCloudMessageSchema>;
export type CloudToRobotMessage = z.infer<typeof cloudToRobotMessageSchema>;

export type ParsedMessage<T> =
  | { kind: 'ok'; message: T }
  | { kind: 'unknown'; type: string }
  | { kind: 'invalid'; issues: z.core.$ZodIssue[] };

// Unknown types come back as "unknown" so the receiver logs and ignores them instead of dropping the connection.
function parseMessage<T>(
  schema: z.ZodType<T>,
  knownTypes: ReadonlySet<string>,
  raw: unknown,
): ParsedMessage<T> {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) return { kind: 'invalid', issues: envelope.error.issues };
  if (!knownTypes.has(envelope.data.type)) return { kind: 'unknown', type: envelope.data.type };
  const result = schema.safeParse(raw);
  return result.success
    ? { kind: 'ok', message: result.data }
    : { kind: 'invalid', issues: result.error.issues };
}

const robotToCloudTypes = new Set(robotToCloudMessageSchema.options.map((o) => o.shape.type.value));
const cloudToRobotTypes = new Set(cloudToRobotMessageSchema.options.map((o) => o.shape.type.value));

export function parseRobotMessage(raw: unknown): ParsedMessage<RobotToCloudMessage> {
  return parseMessage(robotToCloudMessageSchema, robotToCloudTypes, raw);
}

export function parseCloudMessage(raw: unknown): ParsedMessage<CloudToRobotMessage> {
  return parseMessage(cloudToRobotMessageSchema, cloudToRobotTypes, raw);
}
