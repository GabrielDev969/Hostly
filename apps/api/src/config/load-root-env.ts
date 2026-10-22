import { config } from 'dotenv';
import { resolve } from 'path';

// The monorepo keeps a single .env at the repo root; this file lives in apps/api/{src,dist}/config.
config({ path: resolve(__dirname, '../../../../.env'), quiet: true });
