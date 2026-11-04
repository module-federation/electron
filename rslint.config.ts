import { defineConfig, js, reactPlugin, ts } from '@rslint/core';

export default defineConfig([
  { ignores: ['**/dist/**', '**/node_modules/**', '**/@mf-types/**', '**/.turbo/**'] },
  js.configs.recommended,
  ts.configs.recommended,
  {
    files: ['apps/**/*.tsx', 'demo/**/*.tsx'],
    ...reactPlugin.configs.recommended,
  },
  {
    languageOptions: {
      parserOptions: {
        project: [
          './packages/*/tsconfig.json',
          './apps/*/tsconfig.json',
          './demo/zephyr-ota/*/tsconfig.json',
          './tsconfig.json',
        ],
      },
    },
  },
]);
