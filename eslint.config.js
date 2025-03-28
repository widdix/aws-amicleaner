import {defineConfig} from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';

export default defineConfig([{
  files: ['**/*.js'],
  plugins: {
    js,
  },
  extends: ['js/recommended'],
  languageOptions: {
    globals: {
      ...globals.commonjs,
      ...globals.node,
      ...globals.mocha
    },
    ecmaVersion: 2022,
  },
  rules: {
    indent: ['error', 2],
    'linebreak-style': ['error', 'unix'],
    quotes: ['error', 'single'],
    semi: ['error', 'always'],
  },
}]);
