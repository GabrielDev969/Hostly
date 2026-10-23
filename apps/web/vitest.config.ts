import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      // Straight from the source, like the API's Jest: no contracts build needed to run the tests.
      '@hostly/contracts': resolve(import.meta.dirname, '../../packages/contracts/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    env: { NEXT_PUBLIC_API_URL: 'http://api.test' },
  },
});
