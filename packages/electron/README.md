<p align="center">
  <img src="https://raw.githubusercontent.com/module-federation/electron/main/assets/icon.svg" width="96" height="96" alt="Module Federation for Electron">
</p>

<h1 align="center">@module-federation/electron</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@module-federation/electron">
    <img src="https://img.shields.io/npm/v/@module-federation/electron?style=flat-square&colorA=564341&colorB=EDED91" alt="npm version" />
  </a>
  <a href="https://npmcharts.com/compare/@module-federation/electron?minimal=true">
    <img src="https://img.shields.io/npm/dm/@module-federation/electron.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="downloads" />
  </a>
  <a href="https://github.com/module-federation/electron/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/@module-federation/electron?style=flat-square&colorA=564341&colorB=EDED91" alt="license" />
  </a>
</p>

Module Federation for Electron renderers built with Rsbuild or Vite. Hosts and remotes can use either bundler.

In production every federated app is served from one privileged custom protocol, `mf://local/<app-id>/`. All apps share one origin, so remote entries, manifests and chunks load without CORS setup, whether an app's files sit on disk or come from a CDN. Remotes fetched from a URL are cached on disk, so the app keeps working offline.

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

## Remotes deployed to a URL

An app can also be an `http(s)` URL. Requests for `mf://local/<app-id>/<path>` are fetched from `<url>/<path>` in the main process, so the renderer still sees one origin and needs no CORS setup:

```ts
serveFederatedApps({
  apps: {
    host: '/path/to/host/dist',
    remote: 'https://cdn.example.com/remote/',
  },
});
```

Build the remote with the Rsbuild or Vite plugin from this package, so its chunks load from `mf://local/<app-id>/` too. A remote whose `publicPath` is an absolute `https://` URL loads its chunks directly, without the offline cache.

### Offline cache

Responses from remote apps are cached on disk, so the app keeps working when a remote is down:

| Situation                                                                       | Response                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Remote answers 2xx                                                              | The fresh response. It replaces the cached copy.                                           |
| Offline, DNS failure, connection refused                                        | The cached copy.                                                                           |
| Remote answers an error status (a broken deploy returning 500 or 404)           | The cached copy. Error responses are never cached.                                         |
| No response within the connect timeout, or the body stalls for the read timeout | The cached copy. For the next 30 s, other cached requests to that origin skip the network. |
| Not reachable and never cached (first launch offline)                           | `502`, or `504` on a timeout. Module Federation reports a failed remote.                   |

- **Network first.** The cache is used only when the network fails, so a remote that is up serves its latest release. After any failed request, other cached requests to that origin skip the network for 30 s, so a remote that has just recovered is picked up after that window.
- **Only `GET` responses are cached**, together with their headers, so ES module remotes still pass MIME checks offline. Query strings are ignored, so cache-busting parameters still hit the cache.
- Responses served from the cache carry an `x-mf-cache: stale` header (exported as `CACHE_HEADER`). Fallbacks are logged with `console.warn`.
- Writes go through a temporary file and a rename, so a crash never leaves a partial entry. To reset the cache, quit the app and delete its directory.

```ts
serveFederatedApps({
  apps: { remote: 'https://cdn.example.com/remote/' },
  cache: {
    dir: path.join(app.getPath('userData'), 'remotes'), // default: <sessionData>/module-federation
    connectTimeout: 10_000, // ms to wait for response headers
    readTimeout: 10_000, // ms the body may stall, not a limit on the whole download
  },
});
```

Pass `cache: false` to proxy remote apps without caching.

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

## API

From `@module-federation/electron` (main process only, it imports `electron`):

| Export                                                 | Description                                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `registerFederationScheme({ scheme? })`                | Registers the scheme as privileged (standard, secure, fetch, CORS, streaming). Call before `app` is ready. |
| `serveFederatedApps({ apps, cache?, scheme?, host? })` | Serves each app from its directory or URL. Call after `app.whenReady()`. Returns an unregister function.   |
| `resolveAppFile(pathname, dirs)`                       | Resolves an `mf://` path to a file inside an app's directory, or `undefined` if it falls outside.          |
| `CACHE_HEADER`                                         | `'x-mf-cache'`, set to `stale` on responses served from the offline cache.                                 |

From every entry point, including `./rsbuild` and `./vite`:

| Export                                | Description                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `federationUrl(name, file, options?)` | URL of a file inside an app, e.g. `mf://local/remote-vite/mf-manifest.json`.              |
| `federationBaseUrl(name, options?)`   | Base URL an app is served from, e.g. `mf://local/remote-vite/`.                           |
| `toAppId(name)`                       | Normalizes a federation `name` into the URL path segment (`remote_vite` → `remote-vite`). |
| `DEFAULT_SCHEME`, `DEFAULT_HOST`      | `'mf'` and `'local'`.                                                                     |

From `./rsbuild`: `pluginModuleFederationElectron(federation, { electron?, rsbuild? })`, and `pluginElectron(name, options?)` if you register `@module-federation/rsbuild-plugin` yourself.

From `./vite`: `federationElectron(federation, { electron? })`, and `electron(name, options?)` if you register `@module-federation/vite` yourself.

## Troubleshooting

- **A Vite remote's React bindings are `undefined` in an Rsbuild host**: use `@module-federation/vite` 1.23.9 or later ([module-federation/vite#1535](https://github.com/module-federation/vite/issues/1535)).
- **`does not provide an export named 'net'`**: `ELECTRON_RUN_AS_NODE=1` is set, usually by a terminal inside VS Code or another Electron app. Unset it before starting Electron.

## Links

- [Repository and examples](https://github.com/module-federation/electron)
- [Module Federation documentation](https://module-federation.io/)
- [Discord](https://discord.gg/n69NnT3ACV)
- [Issues](https://github.com/module-federation/electron/issues)

## License

[MIT](https://github.com/module-federation/electron/blob/main/LICENSE)
