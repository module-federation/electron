<img src="assets/icon.svg" width="64" height="64" alt="">

# @module-federation/electron

Module Federation for Electron renderers built with **Rsbuild** or **Vite**. Hosts and remotes can use either bundler.

Requires Node.js 22.18+, 24.11+ or 26+ and pnpm 12.9.1.

## Package

[`@module-federation/electron`](packages/electron) has one entry point per job:

| Import                                | What it does                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `@module-federation/electron`         | Electron main process: registers and serves the `mf://` protocol. Also has the URL helpers. |
| `@module-federation/electron/rsbuild` | Wraps `@module-federation/rsbuild-plugin` and adds Electron defaults.                       |
| `@module-federation/electron/vite`    | Wraps `@module-federation/vite` (1.23.9 or later) and adds Electron defaults.               |

The bundler entries re-export the URL helpers (`federationUrl`, `federationBaseUrl`), so build configs never load `electron`.

Install the Module Federation plugin for your bundler next to it. Both are optional peer dependencies.

## How it works

In production, every federated app (hosts and remotes) is served from one privileged custom protocol:

```
mf://local/<app-id>/...        app-id = federation name, normalized (remote_vite -> remote-vite)
```

All apps share one origin, so ESM remote entries, `fetch` of `mf-manifest.json`, and chunk loading work without CORS setup. The bundler plugins set `output.assetPrefix` (Rsbuild) or `base` (Vite) to that URL for production builds. They leave it alone in dev, when you set it yourself, or when you pass `electron: { protocol: false }`.

```ts
// main process
import {
  federationUrl,
  registerFederationScheme,
  serveFederatedApps,
} from '@module-federation/electron';

registerFederationScheme(); // before app is ready
app.whenReady().then(() => {
  serveFederatedApps({ apps: { host: '/path/to/host/dist', remote_vite: '/path/to/remote/dist' } });
  new BrowserWindow().loadURL(federationUrl('host', 'index.html'));
});
```

```ts
// rsbuild.config.ts
import { federationUrl, pluginModuleFederationElectron } from '@module-federation/electron/rsbuild';
plugins: [pluginModuleFederationElectron({ name: 'host', remotes: { ... } })]

// vite.config.ts
import { federationElectron } from '@module-federation/electron/vite';
plugins: [federationElectron({ name: 'remote_vite', exposes: { ... } })]
```

## Example apps

`apps/` has a cross-bundler setup that also serves as the integration test:

- `remote-rsbuild` exposes `./Counter` (dev port 3001)
- `remote-vite` exposes `./Card` (dev port 3002)
- `host-rsbuild` consumes both (dev port 3000)
- `host-vite` consumes both (dev port 3003)
- `electron` is the Electron shell. It loads either host from the dev server or via `mf://`.

All four host/remote combinations render in the smoke test.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm build              # turbo: the package (Rslib, ESM + CJS + .d.ts), then the apps
pnpm test               # Rstest unit tests, plus a check of the built package exports
pnpm typecheck          # tsc per workspace, plus root config files
pnpm lint               # Rslint (type-aware, flat config in rslint.config.ts)
pnpm format             # oxfmt (config in .oxfmtrc.json); format:check for CI
pnpm check:publishable  # fails if the package depends on a URL (e.g. a pkg.pr.new preview)
pnpm pack:electron      # npm pack --dry-run of the package
pnpm smoke              # builds everything, then launches Electron headless against each host
pnpm dev                # all dev servers + Electron (--host=rsbuild by default)
```

Run a production build of the example by hand:

```sh
pnpm --filter example-electron start       # Rsbuild host
pnpm --filter example-electron start:vite  # Vite host
```

See [release instructions](docs/RELEASING.md).

## Notes

- **Vite remotes need `@module-federation/vite` 1.23.9 or later.** Before that, a Vite remote's React bindings could be `undefined` at render time in an Rsbuild host that also loads an Rsbuild remote ([module-federation/vite#1535](https://github.com/module-federation/vite/issues/1535), fixed by [#1536](https://github.com/module-federation/vite/pull/1536)).
- **`ELECTRON_RUN_AS_NODE`**: if your terminal runs inside an Electron app (VS Code, …), it may set `ELECTRON_RUN_AS_NODE=1`. That makes `electron .` run as plain Node, and you'll see `does not provide an export named 'net'`. Unset it first: `env -u ELECTRON_RUN_AS_NODE pnpm smoke`.
- **Release age**: pnpm only installs versions at least a day old. `pnpm-workspace.yaml` makes one exception, for `@module-federation/vite@1.23.9` (the release with the fix above). Remove it after 2026-11-04 17:02 UTC. `@rsbuild/core@2.3.0`, `@rstest/core@0.12.5`, and `oxfmt@0.75.0` are pinned exactly for the same reason.
