import { defineConfig } from '@rslib/core';

const output = {
  distPath: { root: './dist' },
  sourceMap: { js: 'source-map' },
  target: 'node',
} as const;

const shared = {
  bundle: false,
  dts: { autoExtension: true },
  output,
  redirect: { dts: { extension: true } },
  syntax: 'es2022',
} as const;

export default defineConfig({
  lib: [
    { ...shared, id: 'esm', format: 'esm' },
    { ...shared, id: 'cjs', format: 'cjs' },
  ],
  source: {
    entry: { index: ['./src/**/*.ts'] },
    tsconfigPath: './tsconfig.build.json',
  },
});
