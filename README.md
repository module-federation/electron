# @module-federation/electron

Module Federation integration for Electron. This repository currently contains the project and release infrastructure; the integration API is not implemented yet.

Requires Node.js 22.18+, 24.11+ or 26+ and pnpm 12.9.1.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm pack:electron
```

See [release instructions](docs/RELEASING.md).
