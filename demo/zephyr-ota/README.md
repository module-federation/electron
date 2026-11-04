# Zephyr OTA demo

An Electron app whose UI updates without shipping a new app build. The host ships inside the app and is served from `mf://local/ota-host/`. Its two remotes, one built with Rsbuild and one with Vite, are loaded from Zephyr each time the window loads.

```
Electron app (installed)                 Zephyr (tag URLs)
mf://local/ota-host/  ── bundled host ─┬─► ota-remote-rsbuild@electron-demo
                                       └─► ota-remote-vite@electron-demo
```

The host is built against the `electron-demo` tag, not a fixed version. A Zephyr tag URL always serves the newest version that matches the tag, so a new remote deploy shows up the next time the window loads. Each remote card shows its version label and build time, so the change is visible on stage.

| Folder                            | What it is                                                          |
| --------------------------------- | ------------------------------------------------------------------- |
| `remote-rsbuild`                  | `ota-remote-rsbuild`, exposes `./Banner`                            |
| `remote-vite`                     | `ota-remote-vite`, exposes `./Card`                                 |
| `host`                            | `ota-host`, consumes both via `zephyr:dependencies` in package.json |
| `electron`                        | The Electron shell. It bundles the host, not the remotes.           |
| `edge-server.mjs`, `rehearse.mjs` | A local stand-in for Zephyr's edge, and an offline rehearsal        |

Run every command below from this folder.

## Rehearse offline first

No Zephyr account needed. This builds everything locally, serves the remotes the way Zephyr's edge does (one origin per remote, `Access-Control-Allow-Origin: *`, entries that always revalidate), and checks that an update reaches the running app:

```sh
pnpm local:rehearse
```

```
✓ open the app: {"ota_remote_rsbuild":"v1","ota_remote_vite":"v1"}
✓ rebuild only the Vite remote as v2
✓ reload the window: {"ota_remote_rsbuild":"v1","ota_remote_vite":"v2"}
  host build output: 4584002d26ea -> 4584002d26ea
✓ the Vite remote updated without rebuilding the host
```

To click through it by hand: `pnpm local:build`, then `pnpm local:edge` in one terminal and `pnpm start` in another. Rebuild a remote with `DEMO_VERSION=v2 pnpm --filter ota-remote-vite build` and press **Check for updates**.

## Set up Zephyr (once)

1. **Deploy the remotes:** `pnpm zephyr:remotes`. The first run opens a browser to log in, so use a normal terminal.
   Zephyr names the apps after the git remote (org `module-federation`, project `electron`). If that org isn't in your Zephyr account, add a `zephyr.config.ts` with your `org` and `project` to all three apps (`remote-rsbuild`, `remote-vite`, `host`).
2. **Create the tag:** in the Zephyr dashboard, go to DevOps → Tags → New Tag. Name it `electron-demo` and add a condition that matches both remotes' deploys, for example Branch is `demo/zephyr-ota`.
3. **Build the app:** `pnpm zephyr:host`. Zephyr writes the two `electron-demo` tag URLs into the host build, then the Electron shell is built. This also deploys the host to Zephyr, but that copy is meant for the app and won't work in a browser, because its assets point at `mf://`.

## Run the demo

1. `pnpm start`. If the terminal runs inside an Electron app (VS Code, T3 Code, …), use `env -u ELECTRON_RUN_AS_NODE pnpm start`.
2. Change a remote, for example the text in `remote-vite/src/Card.tsx`, and deploy only that remote:
   ```sh
   DEMO_VERSION=v2 pnpm zephyr:remote-vite
   ```
3. Press **Check for updates** in the app. The Vite card shows `v2`, and the app itself wasn't rebuilt or restarted.

**Variation, manual promotion and rollback:** use a Zephyr environment instead of a tag. Change `@electron-demo` in `host/package.json` to an environment name and run `pnpm zephyr:host` again. A version then reaches the app only when you deploy it to that environment from the dashboard, and moving the environment back to an older version rolls the app back.

## What this demo doesn't cover yet

- **Offline:** the remotes come from the network. Offline, their cards show an error. The next step is caching remotes in the main process, with the bundled copy as a fallback, like `zephyr-native-cache` does for React Native.
- **A version can change mid-session:** chunks load lazily from the tag URL. If the tag moves while the window is open, chunks loaded afterwards come from the new version. Reloading avoids that.
- **Dashboard overrides and `ZE_PUBLIC_*` variables:** Zephyr's runtime plugin looks for `zephyr-manifest.json` only on http(s) URLs, so it doesn't find one from an `mf://` page.
- **The main process:** Zephyr updates renderer code only. Changes to the main process, preload scripts or native modules still need an app update (for example `electron-updater`).
- **Turning Zephyr off:** the published Zephyr plugins (1.7.0) have no skip mode. These configs add `withZephyr()` only when `ZEPHYR_DEPLOY=true`, which the `build:zephyr` scripts set. `ZE_DISABLED` exists on Zephyr's main branch, but hasn't been released.
