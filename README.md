<h1 align="center">@module-federation/electron</h1>

<p align="center">
  Module Federation for Electron renderers built with <strong>Rsbuild</strong> or <strong>Vite</strong>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@module-federation/electron">
    <img src="https://img.shields.io/npm/v/@module-federation/electron?style=flat-square&colorA=564341&colorB=EDED91" alt="npm version" />
  </a>
  <a href="https://npmcharts.com/compare/@module-federation/electron?minimal=true">
    <img src="https://img.shields.io/npm/dm/@module-federation/electron.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="downloads" />
  </a>
  <a href="https://github.com/module-federation/electron/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/module-federation/electron/ci.yml?branch=main&style=flat-square&colorA=564341&colorB=EDED91&label=CI" alt="CI status" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/npm/l/@module-federation/electron?style=flat-square&colorA=564341&colorB=EDED91" alt="license" />
  </a>
</p>

## Why

[Module Federation](https://module-federation.io/) lets separately built and deployed apps share code at runtime. In a browser that works over HTTP. In a packaged Electron app it usually does not: renderers load from `file://`, ES module remote entries and `fetch` of `mf-manifest.json` hit CORS and origin rules, and every app ends up needing its own hand-written protocol handler.

This package fixes that with one privileged custom protocol. Every federated app, host or remote, is served from `mf://local/<app-id>/`, so they all share a single origin. Remote entries, manifests and chunks load without any CORS setup, whether the files sit next to the app on disk or come from a CDN. The bundler plugins point production builds at that protocol for you, and hosts and remotes can mix Rsbuild and Vite freely.

## Features

- **One origin for every app.** Hosts and remotes are served from `mf://local/<app-id>/`, so ESM remote entries, manifests and chunks just work.
- **Rsbuild and Vite, in any combination.** Thin wrappers over `@module-federation/rsbuild-plugin` and `@module-federation/vite` that add Electron defaults.
- **Local or deployed remotes.** Point an app at its `dist` directory or at an `https://` URL. Remote requests are proxied through the main process, so the renderer never sees a second origin.
- **Offline cache.** Responses from deployed remotes are cached on disk, so the app keeps working when a remote is down or the machine is offline.
- **Build configs stay Electron-free.** The URL helpers are re-exported from the bundler entries, so `rsbuild.config.ts` and `vite.config.ts` never import `electron`.
- **ESM and CommonJS**, with type definitions for both.

## Getting started

Install the package, plus the Module Federation plugin for each bundler you use. Both bundler plugins are optional peer dependencies.

```sh
pnpm add @module-federation/electron
pnpm add -D @module-federation/rsbuild-plugin   # Rsbuild
pnpm add -D @module-federation/vite             # Vite, 1.23.9 or later
```

### 1. Serve the apps from the main process

Register the scheme before the app is ready, then map each federation `name` to its build output:

```ts
// main.ts
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import {
  federationUrl,
  registerFederationScheme,
  serveFederatedApps,
} from '@module-federation/electron';

registerFederationScheme(); // before `app` is ready

app.whenReady().then(() => {
  serveFederatedApps({
    apps: {
      host: path.join(import.meta.dirname, 'host/dist'),
      remote: 'https://cdn.example.com/remote/', // or a local directory
    },
  });
  new BrowserWindow().loadURL(federationUrl('host', 'index.html'));
});
```

### 2. Build the host and remotes

Swap the usual Module Federation plugin for the Electron wrapper. The options are the same; the wrapper only adds the production asset URL. Use `federationUrl` to point a host at a remote's manifest:

```ts
// host/rsbuild.config.ts
import { defineConfig } from '@rsbuild/core';
import { federationUrl, pluginModuleFederationElectron } from '@module-federation/electron/rsbuild';

export default defineConfig({
  plugins: [
    pluginModuleFederationElectron({
      name: 'host',
      remotes: { remote: `remote@${federationUrl('remote', 'mf-manifest.json')}` },
      shared: { react: { singleton: true }, 'react-dom': { singleton: true } },
    }),
  ],
});
```

```ts
// remote/vite.config.ts
import { defineConfig } from 'vite';
import { federationElectron } from '@module-federation/electron/vite';

export default defineConfig({
  plugins: [
    federationElectron({
      name: 'remote',
      filename: 'remoteEntry.js',
      manifest: true,
      exposes: { './Card': './src/Card.tsx' },
      shared: { react: { singleton: true }, 'react-dom': { singleton: true } },
    }),
  ],
});
```

That's the whole setup. The [package README](packages/electron/README.md) covers every option, the offline cache in detail, and the API reference.

## How it works

```
mf://local/<app-id>/<path>          app-id = federation name, normalized (remote_vite -> remote-vite)
        │
        ├─ app is a directory  →  file from <dir>/<path>        (404 outside the directory)
        └─ app is an https URL →  net.fetch(<url>/<path>)        (network first, disk cache on failure)
```

`registerFederationScheme` registers `mf` as a standard, secure, fetch- and CORS-enabled scheme, which is what ES modules and `fetch` need. `serveFederatedApps` installs one `protocol.handle` for it and routes each request by app id.

On the build side, `pluginModuleFederationElectron` sets `output.assetPrefix` and `federationElectron` sets `base` to `mf://local/<app-id>/` for production builds. They leave dev servers alone, never override a value you set yourself, and step aside entirely with `electron: { protocol: false }`, for example when a remote's chunks should load straight from a CDN.

For deployed remotes the cache is network first: the cached copy is used when a request fails, times out or returns an error status. After a failed request, other cached requests to that origin skip the network for 30 seconds, so a remote that has just recovered can keep serving its cached copy for that long. Cached responses carry an `x-mf-cache: stale` header. See [Offline cache](packages/electron/README.md#offline-cache) for the full behaviour table.

## Entry points

| Import                                | Use it in             | What it does                                                             |
| ------------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| `@module-federation/electron`         | Electron main process | Registers and serves the `mf://` protocol. Also exports the URL helpers. |
| `@module-federation/electron/rsbuild` | `rsbuild.config.ts`   | Wraps `@module-federation/rsbuild-plugin` with Electron defaults.        |
| `@module-federation/electron/vite`    | `vite.config.ts`      | Wraps `@module-federation/vite` with Electron defaults.                  |

## Compatibility

| Dependency       | Supported                                            |
| ---------------- | ---------------------------------------------------- |
| Electron         | 30 or later                                          |
| Node.js (builds) | 22.18+, 24.11+, 26+                                  |
| Rsbuild          | 2.x, with `@module-federation/rsbuild-plugin` 2.9.3+ |
| Vite             | 7 or 8, with `@module-federation/vite` 1.23.9+       |

## Examples

[`apps/`](apps) is a cross-bundler setup that doubles as the integration test. Every host loads both remotes, so all four Rsbuild/Vite combinations are covered.

| App              | Role                                  | Dev port |
| ---------------- | ------------------------------------- | -------- |
| `remote-rsbuild` | Rsbuild remote, exposes `./Counter`   | 3001     |
| `remote-vite`    | Vite remote, exposes `./Card`         | 3002     |
| `host-rsbuild`   | Rsbuild host, consumes both remotes   | 3000     |
| `host-vite`      | Vite host, consumes both remotes      | 3003     |
| `electron`       | Electron shell that loads either host | —        |

```sh
pnpm install
pnpm dev                                   # every dev server plus Electron (Rsbuild host)
pnpm build
pnpm --filter example-electron start       # production build, Rsbuild host over mf://
pnpm --filter example-electron start:vite  # production build, Vite host over mf://
```

`pnpm smoke` loads each host three times: with every app served from its `dist`, with the remotes fetched from a local HTTP server, and again after that server stops, to prove the remotes load from the offline cache.

## Troubleshooting

**A Vite remote's React bindings are `undefined` in an Rsbuild host.** Upgrade `@module-federation/vite` to 1.23.9 or later. Earlier versions break when an Rsbuild host also loads an Rsbuild remote ([module-federation/vite#1535](https://github.com/module-federation/vite/issues/1535), fixed in [#1536](https://github.com/module-federation/vite/pull/1536)).

**`does not provide an export named 'net'` when starting Electron.** Your terminal probably runs inside another Electron app (VS Code, Cursor, …) that sets `ELECTRON_RUN_AS_NODE=1`, so `electron .` runs as plain Node. Unset it: `env -u ELECTRON_RUN_AS_NODE pnpm smoke`.

**A remote loads in dev but not in the packaged app.** Check that the host references the remote with `federationUrl(name, 'mf-manifest.json')` in production, that the remote is built with `manifest: true` (Vite), and that the same federation `name` appears in `serveFederatedApps({ apps })`.

## Contributing

The repo is a pnpm + Turborepo workspace. You need Node.js 22.18+, 24.11+ or 26+ and pnpm 12.9.1.

```sh
pnpm install --frozen-lockfile
pnpm build              # the package (Rslib, ESM + CJS + .d.ts), then the example apps
pnpm test               # Rstest unit tests, plus a check of the built package exports
pnpm typecheck          # tsc per workspace, plus root config files
pnpm lint               # Rslint, type-aware (rslint.config.ts)
pnpm format             # oxfmt (.oxfmtrc.json); format:check in CI
pnpm smoke              # build everything, then run Electron headless against each host
pnpm check:publishable  # fail if the package depends on a URL (e.g. a pkg.pr.new preview)
pnpm pack:electron      # npm pack --dry-run of the package
```

PR titles follow [Conventional Commits](https://www.conventionalcommits.org/) and decide the next release; see [Releasing](docs/RELEASING.md). pnpm only installs versions at least a day old, so a few dependencies are pinned exactly and `pnpm-workspace.yaml` lists the exceptions.

## Community

- [Module Federation documentation](https://module-federation.io/)
- [Discord](https://discord.gg/n69NnT3ACV)
- [GitHub Discussions](https://github.com/module-federation/core/discussions)
- [Issues](https://github.com/module-federation/electron/issues)

## License

[MIT](LICENSE)
