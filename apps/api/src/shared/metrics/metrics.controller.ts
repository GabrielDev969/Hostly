import { Controller, Get, Header, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@shared/decorators/public.decorator';
import { MetricsService } from './metrics.service';
import { MetricsIpAllowlistGuard } from './metrics-ip-allowlist.guard';

@ApiTags('Metrics')
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
@Public()
@SkipThrottle()
@UseGuards(MetricsIpAllowlistGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics scrape endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Metrics in Prometheus text format',
  })
  @ApiResponse({
    status: 403,
    description: 'Caller IP not in METRICS_ALLOWED_IPS',
  })
  async scrape(): Promise<string> {
    return this.metrics.getMetrics();
  }
}
