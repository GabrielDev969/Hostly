import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { buildOpenApiDocument, configureRouting } from './openapi.config';

// apps/api/openapi.json feeds the panel's typed client. `pnpm --filter @hostly/api openapi` rewrites it;
// plain `pnpm test` fails while it is stale. Preview mode resolves no provider, so no database or Redis.
const OPENAPI_PATH = join(__dirname, '..', '..', 'openapi.json');

describe('openapi.json', () => {
  it('is up to date with the routes', async () => {
    const app = await NestFactory.create(AppModule, { preview: true, logger: false });
    configureRouting(app);
    const json = `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`;

    if (process.env.OPENAPI_WRITE === '1') writeFileSync(OPENAPI_PATH, json);

    expect(readFileSync(OPENAPI_PATH, 'utf8')).toBe(json);
  });
});
