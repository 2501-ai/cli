import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+.ts?$': ['ts-jest', {}],
  },

  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // The glob patterns Jest uses to detect test files
  testMatch: ['<rootDir>/src/**/?(*.)+(spec|test).[tj]s'],

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: ['node_modules', 'dist', 'e2e'],
};

export default config;
