import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Ip,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
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
import { MeResponseDto } from './dto/me-response.dto';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie';
import { SetupTwoFactorDto } from './dto/setup-2fa.dto';
import { EnableTwoFactorDto } from './dto/enable-2fa.dto';
import { DisableTwoFactorDto } from './dto/disable-2fa.dto';
import { VerifyTwoFactorDto } from './dto/verify-2fa.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendEmailVerificationDto } from './dto/resend-email-verification.dto';
import { Public } from '@shared/decorators/public.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RateLimit } from '@shared/decorators/rate-limits';
import { Audit } from '@shared/decorators/audit.decorator';
import {
  ApiAuthErrors,
  ApiConflictError,
  ApiRateLimitError,
  ApiServerError,
  ApiValidationError,
} from '@shared/swagger/api-errors.decorator';
import { ErrorResponseDto } from '@shared/dto/error-response.dto';
import type { AccessTokenPayload } from '../services/token.service';
import type { Request, Response } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private register: RegisterUseCase,
    private login: LoginUseCase,
    private refresh: RefreshTokenUseCase,
    private getMe: GetMeUseCase,
    private setup2fa: SetupTwoFactorUseCase,
    private enable2fa: EnableTwoFactorUseCase,
    private disable2fa: DisableTwoFactorUseCase,
    private verify2fa: VerifyTwoFactorUseCase,
    private requestEmailVerification: RequestEmailVerificationUseCase,
    private resendEmailVerification: ResendEmailVerificationUseCase,
    private verifyEmail: VerifyEmailUseCase,
    private forgotPassword: ForgotPasswordUseCase,
    private resetPassword: ResetPasswordUseCase,
    private revokeSession: RevokeSessionUseCase,
  ) {}

  @Public()
  @Post('register')
  @RateLimit('register')
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'auth.register', resource: 'User' })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiValidationError()
  @ApiConflictError('Email already registered')
  @ApiRateLimitError()
  @ApiServerError()
  registerEndpoint(@Body() dto: RegisterDto) {
    return this.register.execute(dto);
  }

  @Public()
  @Post('login')
  @RateLimit('login')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.login.success' })
  @ApiOperation({ summary: 'Authenticate user' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful or 2FA challenge issued',
  })
  @ApiValidationError()
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    type: ErrorResponseDto,
  })
  @ApiRateLimitError()
  @ApiServerError()
  async loginEndpoint(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.login.execute({
      ...dto,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    if ('requires2FA' in result) return result;
    setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Public()
  @Post('refresh')
  @RateLimit('refreshToken')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token (cookie-based)' })
  @ApiResponse({
    status: 200,
    description: 'New access token (refresh cookie rotated)',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing, invalid or expired refresh cookie',
    type: ErrorResponseDto,
  })
  @ApiRateLimitError()
  @ApiServerError()
  async refreshEndpoint(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookie = readRefreshCookie(req);
    if (!cookie) throw new UnauthorizedException('Missing refresh cookie');
    const result = await this.refresh.execute(cookie);
    setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.logout', resource: 'Session' })
  @ApiOperation({
    summary: 'Revoke the current session and clear the refresh cookie',
  })
  @ApiResponse({ status: 204, description: 'Logged out' })
  @ApiAuthErrors()
  @ApiServerError()
  async logoutEndpoint(
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.revokeSession.execute(user.sessionId, user.id);
    clearRefreshCookie(res);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user profile, workspaces and admin flag' })
  @ApiResponse({ status: 200, type: MeResponseDto })
  @ApiAuthErrors()
  @ApiServerError()
  meEndpoint(@CurrentUser() user: AccessTokenPayload) {
    return this.getMe.execute(user.id);
  }

  @ApiBearerAuth()
  @Post('2fa/setup')
  @RateLimit('twoFactorMutate')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.2fa.setup', resource: 'User' })
  @ApiOperation({
    summary: 'Generate a 2FA secret (requires current password)',
  })
  @ApiBody({ type: SetupTwoFactorDto })
  @ApiResponse({ status: 200, description: 'Returns secret and otpauth URL' })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiRateLimitError()
  @ApiServerError()
  setup2faEndpoint(@CurrentUser() user: AccessTokenPayload, @Body() dto: SetupTwoFactorDto) {
    return this.setup2fa.execute(user.id, dto.password);
  }

  @ApiBearerAuth()
  @Post('2fa/enable')
  @RateLimit('twoFactorMutate')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.2fa.enabled', resource: 'User' })
  @ApiOperation({
    summary: 'Activate 2FA after verifying first TOTP code (requires current password)',
  })
  @ApiBody({ type: EnableTwoFactorDto })
  @ApiResponse({
    status: 200,
    description: 'Returns recovery codes (shown once)',
  })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiRateLimitError()
  @ApiServerError()
  enable2faEndpoint(@CurrentUser() user: AccessTokenPayload, @Body() dto: EnableTwoFactorDto) {
    return this.enable2fa.execute(user.id, dto.password, dto.code);
  }

  @ApiBearerAuth()
  @Post('2fa/disable')
  @RateLimit('twoFactorMutate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.2fa.disabled', resource: 'User' })
  @ApiOperation({ summary: 'Disable 2FA (requires password and current TOTP)' })
  @ApiBody({ type: DisableTwoFactorDto })
  @ApiResponse({ status: 204, description: '2FA disabled' })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiRateLimitError()
  @ApiServerError()
  async disable2faEndpoint(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: DisableTwoFactorDto,
  ) {
    await this.disable2fa.execute(user.id, dto.password, dto.code);
  }

  @Public()
  @Post('2fa/verify')
  @RateLimit('twoFactorVerify')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.2fa.verify.success' })
  @ApiOperation({ summary: 'Complete login by verifying 2FA challenge' })
  @ApiBody({ type: VerifyTwoFactorDto })
  @ApiResponse({ status: 200, description: 'Tokens issued' })
  @ApiValidationError()
  @ApiResponse({
    status: 401,
    description: 'Invalid challenge or code',
    type: ErrorResponseDto,
  })
  @ApiRateLimitError()
  @ApiServerError()
  async verify2faEndpoint(
    @Body() dto: VerifyTwoFactorDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.verify2fa.execute({
      challenge: dto.challenge,
      code: dto.code,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @ApiBearerAuth()
  @Post('verify-email/request')
  @RateLimit('emailVerifyRequest')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.email_verification.requested', resource: 'User' })
  @ApiOperation({ summary: 'Resend the email verification link' })
  @ApiResponse({ status: 204, description: 'Verification email queued' })
  @ApiAuthErrors()
  @ApiRateLimitError()
  @ApiServerError()
  async requestEmailVerificationEndpoint(@CurrentUser() user: AccessTokenPayload) {
    await this.requestEmailVerification.execute(user.id);
  }

  // Rate limited in Redis (EmailVerificationRateLimiter), which also holds in tests, not by @RateLimit.
  @Public()
  @Post('verify-email/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.email_verification.resend_requested' })
  @ApiOperation({
    summary:
      'Resend the email verification link without a session; always returns 204 (no user enumeration)',
  })
  @ApiBody({ type: ResendEmailVerificationDto })
  @ApiResponse({
    status: 204,
    description: 'Verification email queued (if the account exists and is not verified yet)',
  })
  @ApiValidationError()
  @ApiRateLimitError()
  @ApiResponse({
    status: 503,
    description: 'Rate limit store unavailable; nothing was queued',
    type: ErrorResponseDto,
  })
  @ApiServerError()
  async resendEmailVerificationEndpoint(@Body() dto: ResendEmailVerificationDto, @Ip() ip: string) {
    await this.resendEmailVerification.execute({ email: dto.email, ip });
  }

  @Public()
  @Post('verify-email')
  @RateLimit('emailVerifyConfirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.email.verified' })
  @ApiOperation({ summary: 'Confirm an email with the token from the link' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({ status: 204, description: 'Email verified' })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired token',
    type: ErrorResponseDto,
  })
  @ApiValidationError()
  @ApiRateLimitError()
  @ApiServerError()
  async verifyEmailEndpoint(@Body() dto: VerifyEmailDto) {
    await this.verifyEmail.execute(dto.token);
  }

  @Public()
  @Post('forgot-password')
  @RateLimit('forgotPassword')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.password_reset.requested' })
  @ApiOperation({
    summary: 'Send a password reset email; always returns 204 (no user enumeration)',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 204,
    description: 'Reset email queued (if user exists)',
  })
  @ApiValidationError()
  @ApiRateLimitError()
  @ApiServerError()
  async forgotPasswordEndpoint(@Body() dto: ForgotPasswordDto) {
    await this.forgotPassword.execute(dto.email);
  }

  @Public()
  @Post('reset-password')
  @RateLimit('resetPassword')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.password_reset.completed' })
  @ApiOperation({
    summary: 'Reset password using the token from the email; revokes all sessions',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 204, description: 'Password reset' })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired token',
    type: ErrorResponseDto,
  })
  @ApiValidationError()
  @ApiRateLimitError()
  @ApiServerError()
  async resetPasswordEndpoint(@Body() dto: ResetPasswordDto) {
    await this.resetPassword.execute({
      token: dto.token,
      newPassword: dto.newPassword,
    });
  }
}
