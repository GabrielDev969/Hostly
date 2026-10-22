import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '@shared/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiServerError } from '@shared/swagger/api-errors.decorator';
import { PrismaHealthIndicator } from '../indicators/prisma.indicator';
import { RedisHealthIndicator } from '../indicators/redis.indicator';
import { QueueHealthIndicator } from '../indicators/queue.indicator';

@ApiTags('Health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly queue: QueueHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe — process is alive' })
  @ApiResponse({ status: 200, description: 'Application is running' })
  @ApiServerError()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — dependencies are reachable' })
  @ApiResponse({
    status: 200,
    description: 'Application is ready to serve traffic',
  })
  @ApiResponse({ status: 503, description: 'A dependency is down' })
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prisma.pingCheck('database'),
      () => this.redis.pingCheck('redis'),
      () => this.queue.pingCheck('queue'),
    ]);
  }
}
