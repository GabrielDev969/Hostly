import { env } from './env.config';

// Browser origins allowed on the HTTP API and on the panel's live socket.
export const corsOrigins: string[] = env.CORS_ORIGINS ?? [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
