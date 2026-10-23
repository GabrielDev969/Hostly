import { z } from 'zod';
import { serialSchema } from '../common.ts';
import { envelopeFields } from './envelope.ts';

export const helloPayloadSchema = z.object({
  serial: serialSchema,
  appVersion: z.string().min(1).max(32),
  romVersion: z.string().min(1).max(64).describe('From getVersion'),
  manifestVersion: z
    .string()
    .min(1)
    .max(128)
    .nullable()
    .describe('Version of the last manifest received; null before the first one'),
  contractVersion: z.int().min(1),
});

export const helloMessageSchema = z.object({
  type: z.literal('hello'),
  ...envelopeFields,
  payload: helloPayloadSchema,
});

export type HelloPayload = z.infer<typeof helloPayloadSchema>;
export type HelloMessage = z.infer<typeof helloMessageSchema>;
