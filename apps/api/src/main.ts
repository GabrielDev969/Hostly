import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.config';
import { corsOrigins } from './config/cors.config';
import { WsAdapter } from '@nestjs/platform-ws';
import { SwaggerModule } from '@nestjs/swagger';
import { buildOpenApiDocument, configureRouting } from './config/openapi.config';
import { configureBodyParsers } from './config/body-parser.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.set('trust proxy', env.TRUST_PROXY);
  app.enableShutdownHooks();
  app.useLogger(app.get(Logger));
  app.useWebSocketAdapter(new WsAdapter(app));
  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  configureBodyParsers(app);

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

  configureRouting(app);

  if (env.NODE_ENV !== 'production') {
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app));
  }
  await app.listen(env.API_PORT);
}
bootstrap().catch((err) => {
  console.error('Fatal error while starting the application:', err);
  process.exit(1);
});
