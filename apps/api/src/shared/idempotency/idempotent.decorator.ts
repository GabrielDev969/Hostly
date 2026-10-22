import { SetMetadata } from '@nestjs/common';
import { IDEMPOTENT_KEY } from './constants';

export interface IdempotentMetadata {
  ttlMs?: number;
}

export const Idempotent = (metadata: IdempotentMetadata = {}) =>
  SetMetadata(IDEMPOTENT_KEY, metadata);
