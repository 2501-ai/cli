import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.debug-workspace/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // TODO: Fix the 32 errors and remove this rule.
      '@typescript-eslint/no-explicit-any': 'off',
      'no-control-regex': 'off', // This is required for the sanitizeWindowsOutput function
    },
  },
];
