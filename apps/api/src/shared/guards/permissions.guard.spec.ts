import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ExecutionContext, ForbiddenException, type Type } from '@nestjs/common';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { TenantScope } from '@shared/tenancy/tenant-scope';
import { CurrentPermissions } from '../decorators/current-permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import { WorkspaceGuard } from './workspace.guard';

const operator: TenantScope = {
  organizationId: 'org1',
  workspaceId: 'w1',
  clientId: null,
  advertiserId: null,
};
const client: TenantScope = { ...operator, clientId: 'client-a' };
const advertiser: TenantScope = { ...client, advertiserId: 'adv-1' };

type ParamFactory = (data: unknown, ctx: ExecutionContext) => unknown;
class Probe {
  handler(@CurrentPermissions() _permissions: string[]): void {
    void _permissions;
  }
}
const currentPermissionsFactory = Object.values(
  Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler') as Record<
    string,
    { factory: ParamFactory }
  >,
)[0]!.factory;

describe('PermissionsGuard', () => {
  const makeContext = (permissions: string[], scope: TenantScope | null = operator) =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class Dummy {},
      switchToHttp: () => ({
        getRequest: () => ({ permissions, scope: scope ?? undefined }),
      }),
    }) as unknown as ExecutionContext;

  let reflector: jest.Mocked<Reflector>;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new PermissionsGuard(reflector);
  });

  it('allows the request when the user holds every required permission', () => {
    reflector.getAllAndOverride.mockReturnValue(['user:read', 'user:create']);

    expect(guard.canActivate(makeContext(['user:read', 'user:create', 'user:delete']))).toBe(true);
  });

  it('throws Forbidden when at least one required permission is missing', () => {
    reflector.getAllAndOverride.mockReturnValue(['user:read', 'user:delete']);

    expect(() => guard.canActivate(makeContext(['user:read']))).toThrow(ForbiddenException);
  });

  it('allows the request when no permissions metadata is present', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(makeContext([]))).toBe(true);
  });

  it('allows the request when the metadata is an empty array', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(makeContext(['user:read']))).toBe(true);
  });

  it('treats missing req.permissions as an empty list', () => {
    reflector.getAllAndOverride.mockReturnValue(['user:read']);
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => class Dummy {},
      switchToHttp: () => ({ getRequest: () => ({ scope: operator }) }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('ignores role permissions above the ceiling of a client or advertiser membership', () => {
    reflector.getAllAndOverride.mockReturnValue(['user:read']);
    for (const scope of [client, advertiser]) {
      expect(() => guard.canActivate(makeContext(['user:read'], scope))).toThrow(
        ForbiddenException,
      );
    }
  });

  it('keeps permissions inside the ceiling of a client membership', () => {
    reflector.getAllAndOverride.mockReturnValue(['audit:read']);
    expect(guard.canActivate(makeContext(['audit:read', 'user:read'], client))).toBe(true);
  });

  it('grants nothing when the request carries no tenant scope', () => {
    reflector.getAllAndOverride.mockReturnValue(['user:read']);
    expect(() => guard.canActivate(makeContext(['user:read'], null))).toThrow(ForbiddenException);
  });
});

describe('CurrentPermissions decorator', () => {
  const read = (req: unknown) =>
    currentPermissionsFactory(undefined, {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext);

  it('applies the ceiling of the membership scope', () => {
    const permissions = ['workspace:read', 'workspace:remove_member'];
    expect(read({ permissions, scope: operator })).toEqual(permissions);
    expect(read({ permissions, scope: client })).toEqual(['workspace:read']);
    expect(read({ permissions })).toEqual([]);
  });
});

// "No scope, no permissions" is only safe if the scope always exists where permissions are read.
describe('routes that read permissions', () => {
  const API_SRC = join(__dirname, '..', '..');
  const controllerFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return controllerFiles(path);
      return path.endsWith('.controller.ts') ? [path] : [];
    });

  const routes = controllerFiles(API_SRC).flatMap((file) =>
    Object.values(require(file) as Record<string, unknown>)
      .filter((value): value is Type => typeof value === 'function')
      .flatMap((controller) => {
        const prototype = controller.prototype as Record<string, unknown>;
        return Object.getOwnPropertyNames(prototype)
          .filter((name) => name !== 'constructor' && typeof prototype[name] === 'function')
          .map((name) => {
            const guards = [
              ...((Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]) ?? []),
              ...((Reflect.getMetadata(GUARDS_METADATA, prototype[name] as object) as unknown[]) ??
                []),
            ];
            const params = Object.values(
              (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, name) as Record<
                string,
                { factory?: unknown }
              >) ?? {},
            );
            return {
              route: `${controller.name}.${name}`,
              guards,
              readsPermissions: params.some((p) => p.factory === currentPermissionsFactory),
            };
          });
      }),
  );

  it('finds the routes it checks (so the scan is not vacuous)', () => {
    expect(routes.filter((r) => r.guards.includes(PermissionsGuard)).length).toBeGreaterThan(10);
    expect(routes.some((r) => r.readsPermissions)).toBe(true);
  });

  it('runs WorkspaceGuard before every PermissionsGuard', () => {
    const misordered = routes
      .filter((r) => r.guards.includes(PermissionsGuard))
      .filter((r) => {
        const workspace = r.guards.indexOf(WorkspaceGuard);
        return workspace === -1 || workspace > r.guards.indexOf(PermissionsGuard);
      })
      .map((r) => r.route);
    expect(misordered).toEqual([]);
  });

  it('runs WorkspaceGuard on every route that reads @CurrentPermissions', () => {
    const unguarded = routes
      .filter((r) => r.readsPermissions && !r.guards.includes(WorkspaceGuard))
      .map((r) => r.route);
    expect(unguarded).toEqual([]);
  });
});
