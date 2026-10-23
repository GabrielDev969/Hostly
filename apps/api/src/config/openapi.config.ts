import { VersioningType, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

// Shared by main.ts and openapi.spec.ts, so the committed openapi.json has the real paths.
export function configureRouting(app: INestApplication): void {
  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/ready', 'metrics', '.well-known/jwks.json'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Workspace API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
