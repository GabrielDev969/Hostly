import type { Request, Response } from 'express';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { RefreshTokenUseCase } from '../use-cases/refresh-token.use-case';
import { GetMeUseCase } from '../use-cases/get-me.use-case';
import { SetupTwoFactorUseCase } from '../use-cases/setup-2fa.use-case';
import { EnableTwoFactorUseCase } from '../use-cases/enable-2fa.use-case';
import { DisableTwoFactorUseCase } from '../use-cases/disable-2fa.use-case';
import { VerifyTwoFactorUseCase } from '../use-cases/verify-2fa.use-case';
import { RequestEmailVerificationUseCase } from '../use-cases/request-email-verification.use-case';
import { ResendEmailVerificationUseCase } from '../use-cases/resend-email-verification.use-case';
import { VerifyEmailUseCase } from '../use-cases/verify-email.use-case';
import { ForgotPasswordUseCase } from '../use-cases/forgot-password.use-case';
import { ResetPasswordUseCase } from '../use-cases/reset-password.use-case';
import { RevokeSessionUseCase } from '@modules/sessions/use-cases/revoke-session.use-case';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

function mockRes(): Response {
  return { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;
}

describe('AuthController', () => {
  let register: jest.Mocked<RegisterUseCase>;
  let login: jest.Mocked<LoginUseCase>;
  let refresh: jest.Mocked<RefreshTokenUseCase>;
  let getMe: jest.Mocked<GetMeUseCase>;
  let setup2fa: jest.Mocked<SetupTwoFactorUseCase>;
  let enable2fa: jest.Mocked<EnableTwoFactorUseCase>;
  let disable2fa: jest.Mocked<DisableTwoFactorUseCase>;
  let verify2fa: jest.Mocked<VerifyTwoFactorUseCase>;
  let requestEmailVerification: jest.Mocked<RequestEmailVerificationUseCase>;
  let resendEmailVerification: jest.Mocked<ResendEmailVerificationUseCase>;
  let verifyEmail: jest.Mocked<VerifyEmailUseCase>;
  let forgotPassword: jest.Mocked<ForgotPasswordUseCase>;
  let resetPassword: jest.Mocked<ResetPasswordUseCase>;
  let revokeSession: jest.Mocked<RevokeSessionUseCase>;
  let controller: AuthController;

  beforeEach(() => {
    register = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RegisterUseCase>;
    login = { execute: jest.fn() } as unknown as jest.Mocked<LoginUseCase>;
    refresh = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RefreshTokenUseCase>;
    getMe = { execute: jest.fn() } as unknown as jest.Mocked<GetMeUseCase>;
    setup2fa = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SetupTwoFactorUseCase>;
    enable2fa = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<EnableTwoFactorUseCase>;
    disable2fa = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DisableTwoFactorUseCase>;
    verify2fa = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<VerifyTwoFactorUseCase>;
    requestEmailVerification = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RequestEmailVerificationUseCase>;
    resendEmailVerification = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ResendEmailVerificationUseCase>;
    verifyEmail = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<VerifyEmailUseCase>;
    forgotPassword = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ForgotPasswordUseCase>;
    resetPassword = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ResetPasswordUseCase>;
    revokeSession = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RevokeSessionUseCase>;
    controller = new AuthController(
      register,
      login,
      refresh,
      getMe,
      setup2fa,
      enable2fa,
      disable2fa,
      verify2fa,
      requestEmailVerification,
      resendEmailVerification,
      verifyEmail,
      forgotPassword,
      resetPassword,
      revokeSession,
    );
  });

  it('registerEndpoint forwards the DTO to RegisterUseCase', async () => {
    const dto: RegisterDto = {
      email: 'jane@example.com',
      name: 'Jane',
      password: 'StrongPass@1234',
    };
    register.execute.mockResolvedValue({
      id: 'u1',
      email: dto.email,
      name: dto.name,
    });

    const result = await controller.registerEndpoint(dto);

    expect(register.execute).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 'u1', email: dto.email, name: dto.name });
  });

  it('loginEndpoint forwards user-agent and IP, sets cookie, returns only access token', async () => {
    const dto: LoginDto = {
      email: 'jane@example.com',
      password: 'StrongPass@1234',
    };
    const req = {
      headers: { 'user-agent': 'jest-runner' },
      ip: '10.0.0.1',
    } as unknown as Request;
    const res = mockRes();
    login.execute.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });

    const result = await controller.loginEndpoint(dto, req, res);

    expect(login.execute).toHaveBeenCalledWith({
      ...dto,
      userAgent: 'jest-runner',
      ipAddress: '10.0.0.1',
    });
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'r',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
    expect(result).toEqual({ accessToken: 'a' });
  });

  it('loginEndpoint returns 2FA challenge without setting the refresh cookie', async () => {
    const req = { headers: {}, ip: '10.0.0.1' } as unknown as Request;
    const res = mockRes();
    login.execute.mockResolvedValue({ requires2FA: true, challenge: 'ch' });

    const result = await controller.loginEndpoint(
      { email: 'a@b.c', password: 'StrongPass@1234' },
      req,
      res,
    );

    expect(result).toEqual({ requires2FA: true, challenge: 'ch' });
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('refreshEndpoint reads the cookie, rotates it, returns only access token', async () => {
    const req = { cookies: { refresh_token: 'rt-1' } } as unknown as Request;
    const res = mockRes();
    refresh.execute.mockResolvedValue({
      accessToken: 'a2',
      refreshToken: 'r2',
    });

    const result = await controller.refreshEndpoint(req, res);

    expect(refresh.execute).toHaveBeenCalledWith('rt-1');
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'r2', expect.any(Object));
    expect(result).toEqual({ accessToken: 'a2' });
  });

  it('refreshEndpoint rejects when the cookie is missing', async () => {
    const req = { cookies: {} } as unknown as Request;
    const res = mockRes();

    await expect(controller.refreshEndpoint(req, res)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refresh.execute).not.toHaveBeenCalled();
  });

  it('meEndpoint forwards the user id', async () => {
    getMe.execute.mockResolvedValue({ id: 'u1' } as never);
    await controller.meEndpoint({ id: 'u1', sessionId: 's1' });
    expect(getMe.execute).toHaveBeenCalledWith('u1');
  });

  it('setup2faEndpoint forwards user id and password', async () => {
    setup2fa.execute.mockResolvedValue({
      secret: 'S',
      otpauthUrl: 'otpauth://x',
    });
    const result = await controller.setup2faEndpoint(
      { id: 'u1', sessionId: 's1' },
      { password: 'pw' },
    );
    expect(setup2fa.execute).toHaveBeenCalledWith('u1', 'pw');
    expect(result.secret).toBe('S');
  });

  it('enable2faEndpoint forwards user id, password and code', async () => {
    enable2fa.execute.mockResolvedValue({ recoveryCodes: ['code-1'] });
    await controller.enable2faEndpoint(
      { id: 'u1', sessionId: 's1' },
      { password: 'pw', code: '123456' },
    );
    expect(enable2fa.execute).toHaveBeenCalledWith('u1', 'pw', '123456');
  });

  it('disable2faEndpoint forwards user id, password, and code', async () => {
    disable2fa.execute.mockResolvedValue(undefined);
    await controller.disable2faEndpoint(
      { id: 'u1', sessionId: 's1' },
      { password: 'pw', code: '654321' },
    );
    expect(disable2fa.execute).toHaveBeenCalledWith('u1', 'pw', '654321');
  });

  it('verify2faEndpoint forwards challenge, code, ua, ip and sets refresh cookie', async () => {
    verify2fa.execute.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
    });
    const req = {
      headers: { 'user-agent': 'jest' },
      ip: '10.0.0.1',
    } as unknown as Request;
    const res = mockRes();
    const result = await controller.verify2faEndpoint(
      { challenge: 'ch', code: '111111' },
      req,
      res,
    );
    expect(verify2fa.execute).toHaveBeenCalledWith({
      challenge: 'ch',
      code: '111111',
      userAgent: 'jest',
      ipAddress: '10.0.0.1',
    });
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'r', expect.any(Object));
    expect(result).toEqual({ accessToken: 'a' });
  });

  it('requestEmailVerificationEndpoint forwards user id', async () => {
    await controller.requestEmailVerificationEndpoint({
      id: 'u1',
      sessionId: 's1',
    });
    expect(requestEmailVerification.execute).toHaveBeenCalledWith('u1');
  });

  it('verifyEmailEndpoint forwards token', async () => {
    await controller.verifyEmailEndpoint({ token: 'tok' });
    expect(verifyEmail.execute).toHaveBeenCalledWith('tok');
  });

  it('resendEmailVerificationEndpoint forwards the email and the client IP', async () => {
    await controller.resendEmailVerificationEndpoint({ email: 'a@b.c' }, '10.0.0.1');
    expect(resendEmailVerification.execute).toHaveBeenCalledWith({
      email: 'a@b.c',
      ip: '10.0.0.1',
    });
  });

  it('forgotPasswordEndpoint forwards email', async () => {
    await controller.forgotPasswordEndpoint({ email: 'a@b.c' });
    expect(forgotPassword.execute).toHaveBeenCalledWith('a@b.c');
  });

  it('logoutEndpoint revokes the current session and clears the refresh cookie', async () => {
    const res = mockRes();
    await controller.logoutEndpoint({ id: 'u1', sessionId: 's1' }, res);
    expect(revokeSession.execute).toHaveBeenCalledWith('s1', 'u1');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/api/v1/auth/refresh' }),
    );
  });

  it('resetPasswordEndpoint forwards token + new password', async () => {
    await controller.resetPasswordEndpoint({
      token: 'tok',
      newPassword: 'StrongPass@123',
    });
    expect(resetPassword.execute).toHaveBeenCalledWith({
      token: 'tok',
      newPassword: 'StrongPass@123',
    });
  });
});
