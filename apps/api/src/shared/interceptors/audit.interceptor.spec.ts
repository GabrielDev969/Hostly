import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from '@modules/audit/services/audit.service';
import { AUDIT_KEY, AuditMetadata } from '../decorators/audit.decorator';

describe('AuditInterceptor', () => {
  let reflector: Reflector;
  let audit: jest.Mocked<Pick<AuditService, 'log'>>;
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    reflector = new Reflector();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    interceptor = new AuditInterceptor(reflector, audit as unknown as AuditService);
  });

  function buildContext(
    meta: AuditMetadata | undefined,
    req: Record<string, unknown>,
  ): ExecutionContext {
    const handler = () => undefined;
    if (meta) Reflect.defineMetadata(AUDIT_KEY, meta, handler);

    return {
      getHandler: () => handler,
      getClass: () => class C {},
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
        getNext: () => undefined,
      }),
      getType: () => 'http',
    } as unknown as ExecutionContext;
  }

  it('skips logging when the handler has no @Audit metadata', async () => {
    const ctx = buildContext(undefined, { method: 'GET' });
    const next: CallHandler = { handle: () => of({ id: 'r1' }) };

    await firstValueFrom(interceptor.intercept(ctx, next));

    expect(audit.log).not.toHaveBeenCalled();
  });

  it('records request metadata, sanitizes secrets and resolves resourceId from response', async () => {
    const ctx = buildContext(
      { action: 'user.update', resource: 'user' },
      {
        method: 'PATCH',
        url: '/api/v1/users/u1',
        route: { path: '/users/:id' },
        params: { id: 'u1' },
        query: {},
        body: { name: 'Jane', password: 'secret', token: 'abc' },
        headers: { 'user-agent': 'jest' },
        ip: '127.0.0.1',
        user: { id: 'caller-id' },
        workspace: { id: 'w1' },
      },
    );
    const next: CallHandler = {
      handle: () => of({ id: 'u1', name: 'Jane' }),
    };

    await firstValueFrom(interceptor.intercept(ctx, next));
    await new Promise((r) => setImmediate(r));

    expect(audit.log).toHaveBeenCalledTimes(1);
    const payload = audit.log.mock.calls[0]![0];
    expect(payload).toMatchObject({
      userId: 'caller-id',
      workspaceId: 'w1',
      action: 'user.update',
      resource: 'user',
      resourceId: 'u1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });
    expect(payload.metadata).toMatchObject({
      method: 'PATCH',
      path: '/users/:id',
      body: { name: 'Jane', password: '[REDACTED]', token: '[REDACTED]' },
    });
  });

  it('returns null resourceId when the response object lacks the configured field', async () => {
    const ctx = buildContext(
      { action: 'user.read', resource: 'user' },
      {
        method: 'GET',
        url: '/api/v1/users/u1',
        params: {},
        query: {},
        body: {},
        headers: {},
      },
    );
    const next: CallHandler = { handle: () => of({ name: 'no id here' }) };

    await firstValueFrom(interceptor.intercept(ctx, next));
    await new Promise((r) => setImmediate(r));

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ resourceId: null }));
  });

  it('coerces numeric response ids to strings', async () => {
    const ctx = buildContext(
      { action: 'item.read', resource: 'item' },
      {
        method: 'GET',
        url: '/api/v1/items/42',
        params: {},
        query: {},
        body: {},
        headers: {},
      },
    );
    const next: CallHandler = { handle: () => of({ id: 42 }) };

    await firstValueFrom(interceptor.intercept(ctx, next));
    await new Promise((r) => setImmediate(r));

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ resourceId: '42' }));
  });

  it('returns null resourceId when the response field is neither string nor number', async () => {
    const ctx = buildContext(
      { action: 'item.read', resource: 'item' },
      {
        method: 'GET',
        url: '/api/v1/items/x',
        params: {},
        query: {},
        body: {},
        headers: {},
      },
    );
    const next: CallHandler = { handle: () => of({ id: { nested: true } }) };

    await firstValueFrom(interceptor.intercept(ctx, next));
    await new Promise((r) => setImmediate(r));

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ resourceId: null }));
  });

  it('takes the first element when the configured param resolves to an array', async () => {
    const ctx = buildContext(
      {
        action: 'user.bulk',
        resource: 'user',
        resourceIdFrom: 'param',
        resourceIdField: 'ids',
      },
      {
        method: 'DELETE',
        url: '/api/v1/users',
        params: { ids: ['u1', 'u2'] },
        query: {},
        body: {},
        headers: {},
      },
    );
    const next: CallHandler = { handle: () => of(undefined) };

    await firstValueFrom(interceptor.intercept(ctx, next));
    await new Promise((r) => setImmediate(r));

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 'u1' }));
  });

  it('returns null resourceId when the configured param resolves to an empty array', async () => {
    const ctx = buildContext(
      {
        action: 'user.bulk',
        resource: 'user',
        resourceIdFrom: 'param',
        resourceIdField: 'ids',
      },
      {
        method: 'DELETE',
        url: '/api/v1/users',
        params: { ids: [] },
        query: {},
        body: {},
        headers: {},
      },
    );
    const next: CallHandler = { handle: () => of(undefined) };

    await firstValueFrom(interceptor.intercept(ctx, next));
    await new Promise((r) => setImmediate(r));

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ resourceId: null }));
  });

  it('falls back to req.url when route.path is missing and recursively sanitizes nested objects', async () => {
    const ctx = buildContext(
      { action: 'user.update', resource: 'user' },
      {
        method: 'POST',
        url: '/api/v1/users/u1',
        params: {},
        query: {},
        body: {
          profile: { secret: 'shh', name: 'Jane' },
          items: [{ label: 'one', value: 'two' }],
        },
        headers: {},
      },
    );
    const next: CallHandler = { handle: () => of({ id: 'u1' }) };

    await firstValueFrom(interceptor.intercept(ctx, next));
    await new Promise((r) => setImmediate(r));

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          path: '/api/v1/users/u1',
          body: {
            profile: { secret: '[REDACTED]', name: 'Jane' },
            items: [{ label: 'one', value: 'two' }],
          },
        }),
      }),
    );
  });

  it('swallows errors thrown by audit.log so the request response is unaffected', async () => {
    audit.log.mockRejectedValueOnce(new Error('db down'));
    const ctx = buildContext(
      { action: 'user.read', resource: 'user' },
      {
        method: 'GET',
        url: '/api/v1/users/u1',
        params: {},
        query: {},
        body: {},
        headers: {},
      },
    );
    const next: CallHandler = { handle: () => of({ id: 'u1' }) };

    await expect(firstValueFrom(interceptor.intercept(ctx, next))).resolves.toEqual({ id: 'u1' });
    await new Promise((r) => setImmediate(r));
  });

  it('redacts camelCase and unfamiliar credential field names (regex-based denylist)', async () => {
    const ctx = buildContext(
      { action: 'integration.created', resource: 'integration' },
      {
        method: 'POST',
        url: '/api/v1/integrations',
        params: {},
        query: {},
        body: {
          name: 'GitHub',
          apiKey: 'gh_1234567890',
          clientSecret: 'shhh',
          newPassword: 'StrongPass@1',
          accessToken: 'tk_abc',
          cvvCode: '123',
          userPin: '4321',
          customerSsn: '111-22-3333',
          ownerCpf: '111.222.333-44',
          billingAddress: '742 Evergreen Terrace',
          birthDate: '1990-01-01',
          cardNumber: '4242 4242 4242 4242',
          totpSecret: 'OTPSEED',
          sessionCookie: 'sid=abc',
          authorizationHeader: 'Bearer xyz',
          passwordHashLeak: 'argon2id$...',
        },
        headers: {},
      },
    );
    const next: CallHandler = { handle: () => of({ id: 'i1' }) };

    await firstValueFrom(interceptor.intercept(ctx, next));
    await new Promise((r) => setImmediate(r));

    const payload = audit.log.mock.calls[0]![0];
    const body = (payload.metadata as { body: Record<string, unknown> }).body;
    expect(body.name).toBe('GitHub');
    for (const key of [
      'apiKey',
      'clientSecret',
      'newPassword',
      'accessToken',
      'cvvCode',
      'userPin',
      'customerSsn',
      'ownerCpf',
      'billingAddress',
      'birthDate',
      'cardNumber',
      'totpSecret',
      'sessionCookie',
      'authorizationHeader',
      'passwordHashLeak',
    ]) {
      expect(body[key]).toBe('[REDACTED]');
    }
  });

  it('truncates long string values past 200 chars with a suffix', async () => {
    const longValue = 'a'.repeat(500);
    const ctx = buildContext(
      { action: 'note.created', resource: 'note' },
      {
        method: 'POST',
        url: '/api/v1/notes',
        params: {},
        query: {},
        body: { content: longValue, short: 'ok' },
        headers: {},
      },
    );
    const next: CallHandler = { handle: () => of({ id: 'n1' }) };

    await firstValueFrom(interceptor.intercept(ctx, next));
    await new Promise((r) => setImmediate(r));

    const body = (
      audit.log.mock.calls[0]![0].metadata as {
        body: { short: string; content: string };
      }
    ).body;
    expect(body.short).toBe('ok');
    expect(body.content.length).toBe(200 + '...[truncated]'.length);
    expect(body.content.endsWith('...[truncated]')).toBe(true);
    expect(body.content.startsWith('aaaa')).toBe(true);
  });

  it('reads resourceId from params when configured with resourceIdFrom: param', async () => {
    const ctx = buildContext(
      {
        action: 'user.delete',
        resource: 'user',
        resourceIdFrom: 'param',
        resourceIdField: 'id',
      },
      {
        method: 'DELETE',
        url: '/api/v1/users/u1',
        params: { id: 'u1' },
        query: {},
        body: {},
        headers: {},
      },
    );
    const next: CallHandler = { handle: () => of(undefined) };

    await firstValueFrom(interceptor.intercept(ctx, next));
    await new Promise((r) => setImmediate(r));

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 'u1' }));
  });
});
