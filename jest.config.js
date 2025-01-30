/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+.tsx?$': ['ts-jest', {}],
  },

  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'v8',

  // Enable coverage collection
  collectCoverage: true,

  // Configure coverage reporting
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],

  // The glob patterns Jest uses to detect test files
  testMatch: ['<rootDir>/src/**/?(*.)+(spec|test).[tj]s?(x)'],

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: ['node_modules', 'dist'],
};
