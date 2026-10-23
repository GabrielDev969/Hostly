import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  // The fake-robot script has unit tests of its own.
  roots: ['<rootDir>', '<rootDir>/../scripts'],
  testRegex: '.*\\.spec\\.ts$',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    'packages/contracts/src/.+\\.ts$': '<rootDir>/../test/transformers/esm-source.mjs',
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  setupFiles: ['<rootDir>/../test/env.ts'],
  moduleNameMapper: {
    '^nanoid$': '<rootDir>/../test/stubs/nanoid.ts',
    // Jest cannot require ESM, so it loads the package source instead of dist.
    '^@hostly/contracts$': '<rootDir>/../../../packages/contracts/src/index.ts',
    '^@core/(.*)$': '<rootDir>/core/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@generated/(.*)$': '<rootDir>/generated/$1',
    '^@test/(.*)$': '<rootDir>/../test/$1',
    '^src/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.spec.ts',
    '!**/*.module.ts',
    '!**/main.ts',
    '!**/index.ts',
    '!**/entities/**',
    '!**/*.repository.interface.ts',
    '!**/repositories/*.interface.ts',
    '!**/generated/**',
    '!**/config/logger.config.ts',
  ],
  coverageDirectory: '../coverage',
};

export default config;
