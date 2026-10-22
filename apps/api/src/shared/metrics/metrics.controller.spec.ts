import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  let svc: MetricsService;
  let controller: MetricsController;

  beforeEach(() => {
    svc = new MetricsService();
    controller = new MetricsController(svc);
  });

  it('returns the Prometheus text exposition for the underlying registry', async () => {
    svc.incLoginAttempt('success');
    const body = await controller.scrape();
    expect(body).toContain('auth_login_attempts_total{result="success"} 1');
  });
});
