import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let svc: MetricsService;

  beforeEach(() => {
    svc = new MetricsService();
  });

  it('exposes Prometheus content-type', () => {
    expect(svc.getContentType()).toMatch(/text\/plain/);
  });

  it('records http request metrics with labels', async () => {
    svc.observeHttpRequest({ method: 'GET', route: '/users/:id', status_code: '200' }, 0.123);
    const text = await svc.getMetrics();
    expect(text).toContain(
      'http_requests_total{method="GET",route="/users/:id",status_code="200"} 1',
    );
    expect(text).toContain('http_request_duration_seconds_bucket');
  });

  it('increments login attempt counter by result', async () => {
    svc.incLoginAttempt('success');
    svc.incLoginAttempt('failure');
    svc.incLoginAttempt('failure');
    const text = await svc.getMetrics();
    expect(text).toContain('auth_login_attempts_total{result="success"} 1');
    expect(text).toContain('auth_login_attempts_total{result="failure"} 2');
  });

  it('increments 2FA enable/verify counters', async () => {
    svc.incTwoFactorEnable('success');
    svc.incTwoFactorVerify('invalid_code');
    const text = await svc.getMetrics();
    expect(text).toContain('auth_2fa_enable_total{result="success"} 1');
    expect(text).toContain('auth_2fa_verify_total{result="invalid_code"} 1');
  });

  it('observes database query duration with operation label', async () => {
    svc.observeQuery('SELECT', 0.005);
    svc.observeQuery('UPDATE', 0.25);
    const text = await svc.getMetrics();
    expect(text).toContain('database_query_duration_seconds_bucket');
    expect(text).toMatch(/operation="SELECT"/);
    expect(text).toMatch(/operation="UPDATE"/);
  });

  it('increments register counter', async () => {
    svc.incRegister('conflict');
    const text = await svc.getMetrics();
    expect(text).toContain('auth_register_total{result="conflict"} 1');
  });
});
