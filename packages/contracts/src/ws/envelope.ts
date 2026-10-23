import { z } from 'zod';
import { dateTimeSchema } from '../common.ts';

export const envelopeFields = {
  id: z.uuid().optional(),
  sentAt: dateTimeSchema.describe("Sender's clock"),
};

// Only the shape every message shares; used to tell an unknown type apart from a broken message.
export const envelopeSchema = z.object({
  type: z.string().min(1),
  ...envelopeFields,
  payload: z.record(z.string(), z.unknown()),
});
