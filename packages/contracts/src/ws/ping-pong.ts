import { z } from 'zod';
import { envelopeFields } from './envelope.ts';

// Either side pings; the pong echoes the ping id.
export const pingMessageSchema = z.object({
  type: z.literal('ping'),
  ...envelopeFields,
  id: z.uuid(),
  payload: z.object({}),
});

export const pongMessageSchema = z.object({
  type: z.literal('pong'),
  ...envelopeFields,
  id: z.uuid(),
  payload: z.object({}),
});

export type PingMessage = z.infer<typeof pingMessageSchema>;
export type PongMessage = z.infer<typeof pongMessageSchema>;
