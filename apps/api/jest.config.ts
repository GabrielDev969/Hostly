import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  setupFiles: ['<rootDir>/../test/env.ts'],
  moduleNameMapper: {
    '^nanoid$': '<rootDir>/../test/stubs/nanoid.ts',
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
