import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.set('trust proxy', env.TRUST_PROXY);
  app.enableShutdownHooks();
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: env.CORS_ORIGINS ?? ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/ready', 'metrics', '.well-known/jwks.json'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Workspace API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }
  await app.listen(env.API_PORT);
}
bootstrap().catch((err) => {
  console.error('Fatal error while starting the application:', err);
  process.exit(1);
});
