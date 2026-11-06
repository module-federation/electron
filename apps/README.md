# Example apps

A cross-bundler setup that also serves as the integration test (`pnpm smoke`):

| App              | Role                                  | Dev port |
| ---------------- | ------------------------------------- | -------- |
| `remote-rsbuild` | Rsbuild remote, exposes `./Counter`   | 3001     |
| `remote-vite`    | Vite remote, exposes `./Card`         | 3002     |
| `host-rsbuild`   | Rsbuild host, consumes both remotes   | 3000     |
| `host-vite`      | Vite host, consumes both remotes      | 3003     |
| `electron`       | Electron shell that loads either host | —        |

In dev, the Electron shell loads a host from its dev server. Otherwise it serves every app's `dist` over `mf://` and loads the host from there.

`pnpm smoke` loads each host three times: with every app served from its `dist`, with the remotes fetched from a local HTTP server, and again after that server stops, to check that the remotes load from the offline cache.
