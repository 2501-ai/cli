import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['node_modules/**', 'dist/**', 'prisma/**/*', '**/*.js'],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-void': 'error',
      // Catch async functions called without await
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Additional async/await safety rules
      'require-await': 'off', // Turn off base rule
      '@typescript-eslint/require-await': 'error',
      // Show warning when using 'any' type
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
