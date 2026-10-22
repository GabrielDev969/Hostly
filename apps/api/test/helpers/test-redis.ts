import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';

let container: StartedRedisContainer | null = null;

export async function startTestRedis(): Promise<void> {
  if (container) return;

  container = await new RedisContainer('redis:8.10.2-alpine3.23').start();

  process.env.REDIS_HOST = container.getHost();
  process.env.REDIS_PORT = String(container.getPort());
  delete process.env.REDIS_PASSWORD;
}

export async function stopTestRedis(): Promise<void> {
  if (container) await container.stop();
  container = null;
}

export default async function globalSetup(): Promise<void> {
  await startTestRedis();
}
