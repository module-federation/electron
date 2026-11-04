import { defineConfig } from '@rslib/core';

// Builds the Electron main process. `electron` is a devDependency, so mark it external explicitly.
export default defineConfig({
  lib: [{ format: 'esm', syntax: 'es2023' }],
  source: { entry: { main: './src/main.ts' } },
  output: { target: 'node', externals: ['electron'] },
});
