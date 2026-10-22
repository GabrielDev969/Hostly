import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const makeContext = (permissions: string[]): ExecutionContext =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class Dummy {},
      switchToHttp: () => ({
        getRequest: () => ({ permissions }),
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
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
