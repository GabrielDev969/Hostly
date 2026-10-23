import { z } from 'zod';
import { dateTimeSchema, serialSchema } from './common.ts';

export const pairStartRequestSchema = z.object({
  serial: serialSchema,
});

export const pairStartResponseSchema = z.object({
  pairingId: z.uuid(),
  code: z
    .string()
    .regex(/^\d{6}$/)
    .describe('Six-digit code shown on the touch screen and typed in the panel'),
  expiresAt: dateTimeSchema,
});

export const pairPollRequestSchema = z.object({
  pairingId: z.uuid(),
});

// The token is delivered once; after that the pairing is gone and polling answers "expired".
export const pairPollResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('pending'),
    expiresAt: dateTimeSchema,
  }),
  z.object({
    status: z.literal('approved'),
    robotId: z.uuid(),
    deviceToken: z.string().min(32).max(256),
  }),
  z.object({
    status: z.literal('expired'),
  }),
]);

export type PairStartRequest = z.infer<typeof pairStartRequestSchema>;
export type PairStartResponse = z.infer<typeof pairStartResponseSchema>;
export type PairPollRequest = z.infer<typeof pairPollRequestSchema>;
export type PairPollResponse = z.infer<typeof pairPollResponseSchema>;
