import { Controller, Get, HttpCode, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@shared/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtKeyResolverService } from '@modules/auth/services/jwt-key-resolver.service';
import type { JwksPayload } from '@modules/auth/services/jwt-key-resolver.service';

@ApiTags('Well-Known')
@Controller({ path: '.well-known', version: VERSION_NEUTRAL })
@Public()
@SkipThrottle()
export class WellKnownController {
  constructor(private readonly resolver: JwtKeyResolverService) {}

  @Get('jwks.json')
  @HttpCode(200)
  @ApiOperation({ summary: 'JWKS — public keys accepted for JWT verification' })
  @ApiResponse({
    status: 200,
    description: 'RFC 7517 JWKS payload',
  })
  jwks(): JwksPayload {
    return this.resolver.jwks;
  }
}
