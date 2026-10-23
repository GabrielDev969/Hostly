import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { WsAdapter } from '@nestjs/platform-ws';
import type { Writable } from 'stream';
import { Logger, PARAMS_PROVIDER_TOKEN, type Params } from 'nestjs-pino';
import type { Options } from 'pino-http';
import { AppModule } from '../../src/app.module';
import { loggerConfig } from '../../src/config/logger.config';
import { EmailDispatcher } from '../../src/shared/mailer/email-dispatcher.service';
import { TestEmailDispatcher } from './test-email-dispatcher';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { createRedisCache } from './redis-cache';

export interface TestAppHandle {
  app: INestApplication;
  emailDispatcher: TestEmailDispatcher;
}

export interface TestAppOptions {
  // Sends every log, at trace level, through the app's real pino config into this stream (silent otherwise).
  logs?: Writable;
  // Caches in Redis, as production does, instead of the in-memory store NODE_ENV=test picks.
  redisCache?: boolean;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<TestAppHandle> {
  const emailDispatcher = new TestEmailDispatcher();

  let builder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(EmailDispatcher)
    .useValue(emailDispatcher);
  if (options.logs) {
    const pinoOptions = {
      ...(loggerConfig.pinoHttp as Options),
      level: 'trace',
      transport: undefined,
    };
    const params: Params = { ...loggerConfig, pinoHttp: [pinoOptions, options.logs] };
    builder = builder.overrideProvider(PARAMS_PROVIDER_TOKEN).useValue(params);
  }
  if (options.redisCache) {
    const cache = createRedisCache();
    builder = builder
      .overrideProvider(CACHE_MANAGER)
      .useValue(Object.assign(cache, { onModuleDestroy: () => cache.disconnect() }));
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication(options.logs ? { bufferLogs: true } : {});
  if (options.logs) app.useLogger(app.get(Logger));

  app.useWebSocketAdapter(new WsAdapter(app));
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/ready', 'metrics', '.well-known/jwks.json'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  await app.init();
  return { app, emailDispatcher };
}
