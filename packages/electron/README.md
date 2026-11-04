# @module-federation/electron

Module Federation for Electron renderers built with Rsbuild or Vite. Hosts and remotes can use either bundler.

In production every federated app is served from one privileged custom protocol, `mf://local/<app-id>/`. All apps share one origin, so remote entries, manifests and chunks load without CORS setup.

## Install

```sh
pnpm add @module-federation/electron
# plus the Module Federation plugin for each bundler you use:
pnpm add -D @module-federation/rsbuild-plugin   # Rsbuild
pnpm add -D @module-federation/vite             # Vite, 1.23.9 or later
```

Requires Electron 30 or later and Node.js 22.18+, 24.11+ or 26+ for builds. Rsbuild 2 and Vite 7 or 8 are supported.

## Main process

```ts
import { app, BrowserWindow } from 'electron';
import {
  federationUrl,
  registerFederationScheme,
  serveFederatedApps,
} from '@module-federation/electron';

registerFederationScheme(); // before `app` is ready

app.whenReady().then(() => {
  serveFederatedApps({
    apps: { host: '/path/to/host/dist', remote: '/path/to/remote/dist' },
  });
  new BrowserWindow().loadURL(federationUrl('host', 'index.html'));
});
```

`serveFederatedApps` maps each federation `name` to its build directory and returns a function that unregisters the handler. Requests outside an app's directory get a 404.

## Rsbuild

`./rsbuild` and `./vite` re-export the URL helpers, so build configs don't load `electron`.

```ts
import { defineConfig } from '@rsbuild/core';
import { federationUrl, pluginModuleFederationElectron } from '@module-federation/electron/rsbuild';

export default defineConfig({
  plugins: [
    pluginModuleFederationElectron({
      name: 'host',
      remotes: { remote: `remote@${federationUrl('remote', 'mf-manifest.json')}` },
    }),
  ],
});
```

## Vite

```ts
import { defineConfig } from 'vite';
import { federationElectron } from '@module-federation/electron/vite';

export default defineConfig({
  plugins: [
    federationElectron({
      name: 'remote',
      exposes: { './Card': './src/Card.tsx' },
    }),
  ],
});
```

## Options

Both plugins take a second argument, `{ electron: { protocol, scheme, host } }`:

- `protocol` (default `true`): set `output.assetPrefix` (Rsbuild) or `base` (Vite) to `mf://local/<app-id>/` for production builds. Dev servers, explicit values, and `protocol: false` are left alone.
- `scheme` / `host` (default `mf` / `local`): change the URL. Pass the same values to `registerFederationScheme` and `serveFederatedApps`.

The Rsbuild plugin also takes `{ rsbuild }`, which is passed through to `@module-federation/rsbuild-plugin`.
