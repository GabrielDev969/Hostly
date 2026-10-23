import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../../src/app.module';
import { EmailDispatcher } from '../../src/shared/mailer/email-dispatcher.service';
import { TestEmailDispatcher } from './test-email-dispatcher';

export interface TestAppHandle {
  app: INestApplication;
  emailDispatcher: TestEmailDispatcher;
}

export async function createTestApp(): Promise<TestAppHandle> {
  const emailDispatcher = new TestEmailDispatcher();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(EmailDispatcher)
    .useValue(emailDispatcher)
    .compile();

  const app = moduleRef.createNestApplication();

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
