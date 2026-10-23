// @ts-check
import { defineConfig } from 'eslint/config';
import shared from '@hostly/config/eslint';

export default defineConfig(
  shared,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // node:test returns promises from describe/it; the runner awaits them.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
);
