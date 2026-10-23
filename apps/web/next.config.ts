import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import { tokenPageHeaders, tokenRequestLogPatterns } from './src/lib/security-headers';

// The monorepo keeps a single .env at the repo root; on its own, Next only reads apps/web. Next has
// already loaded (and cached) apps/web by now, so the reload flag is what makes the root count.
loadEnvConfig(
  resolve(import.meta.dirname, '../..'),
  process.env.NODE_ENV !== 'production',
  console,
  true,
);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The repo is guided by CLAUDE.md; keep next dev from writing an AGENTS.md into apps/web.
  agentRules: false,
  // The bottom-left default covers the sidebar's "Sair" button.
  devIndicators: { position: 'bottom-right' },
  headers: () => Promise.resolve(tokenPageHeaders()),
  logging: { incomingRequests: { ignore: tokenRequestLogPatterns } },
};

export default nextConfig;
