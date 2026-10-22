import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { AUDIT_KEY, AuditMetadata } from '../decorators/audit.decorator';
import { AuditService } from '@modules/audit/services/audit.service';
import { Request } from 'express';

type AuditRequest = Request & {
  user?: { id: string };
  workspace?: { id: string };
};

// Match anything that smells like a credential, secret, or PII. Denylist
// rather than allowlist because we want to keep most request shape visible
// for forensics; but the cost of a missed credential is far higher than a
// missed audit field. Anchored substrings so e.g. `clientSecret`, `apiKey`,
// `newPassword`, `cvvCode`, `userCpf` are all matched.
const SENSITIVE_FIELD_PATTERN =
  /(pass|secret|token|key|credential|auth|cookie|cvv|pin|otp|hash|salt|nonce|ssn|cpf|cnpj|rg|birth|dob|phone|address|card)/i;

const MAX_VALUE_LENGTH = 200;
const TRUNCATION_SUFFIX = '...[truncated]';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMetadata>(AUDIT_KEY, ctx.getHandler());
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<AuditRequest>();

    // Await the audit write before emitting the response so callers get the
    // "200 → audit is committed" guarantee (matters for SOC2 and avoids
    // dangling transactions when the process shuts down right after the
    // request). AuditService.log already swallows its own errors, so a
    // failed audit log will not break the user-facing response.
    return next.handle().pipe(
      mergeMap((response: unknown) =>
        from(
          this.recordLog(meta, req, response)
            .catch(() => undefined)
            .then(() => response),
        ),
      ),
    );
  }

  private async recordLog(
    meta: AuditMetadata,
    req: AuditRequest,
    response: unknown,
  ): Promise<void> {
    const resourceId = this.extractResourceId(meta, req, response);

    const route = req.route as { path?: string } | undefined;

    await this.audit.log({
      userId: req.user?.id ?? null,
      workspaceId: req.workspace?.id ?? null,
      action: meta.action,
      resource: meta.resource ?? null,
      resourceId,
      metadata: {
        method: req.method,
        path: route?.path ?? req.url,
        params: this.sanitize(req.params),
        query: this.sanitize(req.query),
        body: this.sanitize(req.body),
      },
      ipAddress: req.ip ?? null,
      userAgent: req.headers?.['user-agent'] ?? null,
    });
  }

  private extractResourceId(
    meta: AuditMetadata,
    req: AuditRequest,
    response: unknown,
  ): string | null {
    const field = meta.resourceIdField ?? 'id';
    const source = meta.resourceIdFrom ?? 'response';

    if (source === 'param') {
      const paramValue = req.params[field];
      if (Array.isArray(paramValue)) {
        return paramValue[0] ?? null;
      }
      return paramValue ?? null;
    }

    if (response && typeof response === 'object' && field in response) {
      const value = (response as Record<string, unknown>)[field];
      return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
    }

    return null;
  }

  private sanitize(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return this.truncate(value);
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => this.sanitize(v));

    const clone: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_FIELD_PATTERN.test(key)) {
        clone[key] = '[REDACTED]';
      } else {
        clone[key] = this.sanitize(val);
      }
    }
    return clone;
  }

  private truncate(value: string): string {
    if (value.length <= MAX_VALUE_LENGTH) return value;
    return value.slice(0, MAX_VALUE_LENGTH) + TRUNCATION_SUFFIX;
  }
}
