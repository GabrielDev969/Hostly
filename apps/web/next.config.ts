import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// The monorepo keeps a single .env at the repo root; on its own, Next only reads apps/web.
loadEnvConfig(resolve(import.meta.dirname, '../..'), process.env.NODE_ENV !== 'production');

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
