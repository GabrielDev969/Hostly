import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMetadata {
  action: string;
  resource?: string;
  resourceIdFrom?: 'response' | 'param';
  resourceIdField?: string;
}

export const Audit = (metadata: AuditMetadata) => SetMetadata(AUDIT_KEY, metadata);
