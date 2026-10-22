import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const makeContext = (): ExecutionContext =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class Dummy {},
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    }) as unknown as ExecutionContext;

  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns true without invoking Passport when the route is marked public', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const passportSpy = jest.spyOn(
      AuthGuard('jwt').prototype as { canActivate: () => unknown },
      'canActivate',
    );
    const guard = new JwtAuthGuard(reflector);

    expect(guard.canActivate(makeContext())).toBe(true);
    expect(passportSpy).not.toHaveBeenCalled();
  });

  it('delegates to Passport for protected routes and accepts a valid token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jest
      .spyOn(AuthGuard('jwt').prototype as { canActivate: () => Promise<boolean> }, 'canActivate')
      .mockResolvedValue(true);
    const guard = new JwtAuthGuard(reflector);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('propagates UnauthorizedException from Passport for expired tokens', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jest
      .spyOn(AuthGuard('jwt').prototype as { canActivate: () => Promise<boolean> }, 'canActivate')
      .mockRejectedValue(new UnauthorizedException('jwt expired'));
    const guard = new JwtAuthGuard(reflector);

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
