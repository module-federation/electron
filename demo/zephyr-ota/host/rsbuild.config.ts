import { pluginModuleFederationElectron } from '@module-federation/electron/rsbuild';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { withZephyr } from 'zephyr-rsbuild-plugin';

// The host ships inside the Electron app and is served from `mf://local/ota-host/`.
//
// With Zephyr on (`build:zephyr`), withZephyr() replaces these remote URLs with the
// `electron-demo` tag URLs from `zephyr:dependencies` in package.json. A tag URL always
// serves the newest matching version, so the installed app picks up remote deploys
// without being rebuilt.
//
// With Zephyr off (`build`), the URLs below stay. They point at
// edge-server.mjs, which serves the remotes the way Zephyr's edge does.
const deployToZephyr = process.env.ZEPHYR_DEPLOY === 'true';

export default defineConfig({
  html: { title: 'Zephyr OTA demo' },
  plugins: [
    pluginReact(),
    pluginModuleFederationElectron({
      name: 'ota_host',
      remotes: {
        ota_remote_rsbuild: 'ota_remote_rsbuild@http://localhost:4001/mf-manifest.json',
        ota_remote_vite: 'ota_remote_vite@http://localhost:4002/mf-manifest.json',
      },
      shared: { react: { singleton: true }, 'react-dom': { singleton: true } },
      dts: false,
    }),
    // Published zephyr plugins (1.7.0) have no skip mode yet, so only add the plugin when deploying.
    ...(deployToZephyr ? [withZephyr()] : []),
  ],
});
