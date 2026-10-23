// @ts-check
import { defineConfig, globalIgnores } from 'eslint/config';
import shared from '@hostly/config/eslint';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';

// eslint-config-next is left out: it pulls eslint-plugin-react and eslint-plugin-import, which do not
// support ESLint 10 yet. The Next, hooks and a11y plugins are wired directly instead.
export default defineConfig(
  globalIgnores(['next-env.d.ts', 'src/lib/api/schema.d.ts']),
  shared,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  nextPlugin.configs['core-web-vitals'],
  reactHooks.configs.flat['recommended-latest'],
  jsxA11y.flatConfigs.recommended,
);
