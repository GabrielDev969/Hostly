import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { WsAdapter } from '@nestjs/platform-ws';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Writable } from 'stream';
import { Logger, PARAMS_PROVIDER_TOKEN, type Params } from 'nestjs-pino';
import type { Options } from 'pino-http';
import { AppModule } from '../../src/app.module';
import { loggerConfig } from '../../src/config/logger.config';
import { EmailDispatcher } from '../../src/shared/mailer/email-dispatcher.service';
import { TestEmailDispatcher } from './test-email-dispatcher';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { createRedisCache } from './redis-cache';
import { configureBodyParsers } from '../../src/config/body-parser.config';

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

  const app = moduleRef.createNestApplication<NestExpressApplication>(
    options.logs ? { bufferLogs: true } : {},
  );
  if (options.logs) app.useLogger(app.get(Logger));

  app.useWebSocketAdapter(new WsAdapter(app));
  app.use(cookieParser());
  configureBodyParsers(app);
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

  // One server per app, bound where supertest and the sockets connect. Left unbound, supertest opens a listen(0) on ::
  // per request, and macOS can hand it a port another process holds on 127.0.0.1 only: "socket hang up" (#103).
  await app.listen(0, '127.0.0.1');
  return { app, emailDispatcher };
}
