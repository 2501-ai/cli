/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+.tsx?$': ['ts-jest', {}],
  },

  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // The glob patterns Jest uses to detect test files
  testMatch: ['<rootDir>/src/**/?(*.)+(spec|test).[tj]s?(x)'],

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: ['node_modules', 'dist', 'e2e'],
};
