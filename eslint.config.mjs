// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config({
  extends: [eslint.configs.recommended, tseslint.configs.recommended],
  basePath: 'src',
  files: ['src/**/*.ts'],
  ignores: ['node_modules', 'dist'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
  },
});
