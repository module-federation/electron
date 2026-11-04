import { pluginModuleFederationElectron } from '@module-federation/electron/rsbuild';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { withZephyr } from 'zephyr-rsbuild-plugin';

const deployToZephyr = process.env.ZEPHYR_DEPLOY === 'true';

export default defineConfig({
  server: { port: 4001, strictPort: true },
  html: { title: 'ota_remote_rsbuild' },
  // Zephyr serves this remote from its own URL, so chunks must resolve relative to the
  // remote entry rather than to the `mf://` protocol the bundled host uses.
  output: { assetPrefix: 'auto' },
  source: {
    define: {
      __DEMO_VERSION__: JSON.stringify(process.env.DEMO_VERSION ?? 'v1'),
      __BUILT_AT__: JSON.stringify(new Date().toISOString()),
    },
  },
  plugins: [
    pluginReact(),
    pluginModuleFederationElectron(
      {
        name: 'ota_remote_rsbuild',
        filename: 'remoteEntry.js',
        exposes: { './Banner': './src/Banner.tsx' },
        shared: { react: { singleton: true }, 'react-dom': { singleton: true } },
        dts: false,
      },
      { electron: { protocol: false } },
    ),
    // Published zephyr plugins (1.7.0) have no skip mode yet, so only add the plugin when deploying.
    ...(deployToZephyr ? [withZephyr()] : []),
  ],
});
