import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CACHE_HEADER,
  federationUrl,
  registerFederationScheme,
  resolveAppFile,
  serveFederatedApps,
  toAppId,
} from '@module-federation/electron';
import { app, BrowserWindow, session } from 'electron';

const HOSTS = {
  rsbuild: { name: 'host_rsbuild', devUrl: 'http://localhost:3000/' },
  vite: { name: 'host_vite', devUrl: 'http://localhost:3003/' },
} as const;
type HostKind = keyof typeof HOSTS;

const REMOTES = ['remote_rsbuild', 'remote_vite'];

const args = new Set(process.argv.slice(2));
const isDev = args.has('--dev');
const isSmoke = args.has('--smoke');
const hostKind: HostKind = args.has('--host=vite') ? 'vite' : 'rsbuild';

const examples = path.resolve(import.meta.dirname, '../..');
const dist = (dir: string) => path.join(examples, dir, 'dist');
const localApps = {
  host_rsbuild: dist('host-rsbuild'),
  host_vite: dist('host-vite'),
  remote_rsbuild: dist('remote-rsbuild'),
  remote_vite: dist('remote-vite'),
};

// Must run before `app` is ready.
registerFederationScheme();

function hostUrl(kind: HostKind) {
  const host = HOSTS[kind];
  return isDev ? host.devUrl : federationUrl(host.name, 'index.html');
}

function createWindow(options: { show: boolean; logPrefix: string }) {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    show: options.show,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.webContents.on('console-message', ({ level, message }) => {
    if (level === 'error') console.log(`[${options.logPrefix}:${level}] ${message}`);
  });
  return win;
}

/**
 * Loads one host and waits until every remote renders, one fails, or 15s pass.
 * With `expectCache`, also checks that each remote's manifest is served from the offline cache.
 */
async function smokeHost(
  kind: HostKind,
  label: string,
  options: { expectCache?: boolean } = {},
): Promise<boolean> {
  const win = createWindow({ show: false, logPrefix: `renderer:${kind}` });
  const tag = `[smoke:${label}] host_${kind}`;
  try {
    await win.loadURL(hostUrl(kind));
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const state: { rendered: string[]; errors: Record<string, string> } = await win.webContents
        .executeJavaScript(`({
          rendered: [...document.querySelectorAll('[data-mf-remote]')].map((el) => el.dataset.mfRemote),
          errors: Object.fromEntries(
            [...document.querySelectorAll('[data-mf-error]')].map((el) => [el.dataset.mfError, el.textContent]),
          ),
        })`);
      if (state.rendered.length + Object.keys(state.errors).length === REMOTES.length) {
        let ok = Object.keys(state.errors).length === 0;
        for (const remote of REMOTES) {
          const error = state.errors[remote];
          let detail = error ? `FAIL ${error}` : 'ok';
          if (!error && options.expectCache) {
            const cache: string | null = await win.webContents.executeJavaScript(
              `fetch(${JSON.stringify(federationUrl(remote, 'mf-manifest.json'))}, { cache: 'no-store' })
                .then((response) => response.headers.get(${JSON.stringify(CACHE_HEADER)}))`,
            );
            if (cache !== 'stale') {
              ok = false;
              detail = `FAIL manifest not served from the cache (${CACHE_HEADER}: ${cache})`;
            }
          }
          console.log(`${tag} <- ${remote}: ${detail}`);
        }
        return ok;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const body = await win.webContents.executeJavaScript('document.body.innerHTML');
    console.log(`${tag}: FAIL timed out waiting for remotes. <body>:\n${body}`);
    return false;
  } finally {
    win.destroy();
  }
}

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
};

/** Serves each remote's `dist` over HTTP at `/<app-id>/`, standing in for a CDN. */
async function serveRemotesOverHttp() {
  let requests = 0;
  const apps = Object.fromEntries(
    REMOTES.map((name) => [toAppId(name), localApps[name as keyof typeof localApps]]),
  );
  const server = createServer(async (req, res) => {
    requests++;
    const file = resolveAppFile(new URL(req.url ?? '/', 'http://x').pathname, apps);
    const body = file && (await readFile(file).catch(() => undefined));
    if (!file || !body) return void res.writeHead(404).end();
    res
      .writeHead(200, {
        'content-type': MIME_TYPES[path.extname(file)] ?? 'application/octet-stream',
        // Keep Chromium's own cache out of the way, so the offline pass relies on ours.
        'cache-control': 'no-store',
      })
      .end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: (name: string) => `${origin}/${toAppId(name)}/`,
    requests: () => requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

async function smoke(): Promise<boolean> {
  const results: boolean[] = [];
  const hosts = Object.keys(HOSTS) as HostKind[];

  // Every app from its build directory.
  let unhandle = serveFederatedApps({ apps: localApps });
  for (const kind of hosts) results.push(await smokeHost(kind, 'dist'));
  unhandle();

  // Remotes from a URL, then from the offline cache once that URL is down.
  const remotes = await serveRemotesOverHttp();
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'mf-electron-smoke-'));
  unhandle = serveFederatedApps({
    apps: {
      ...localApps,
      ...Object.fromEntries(REMOTES.map((name) => [name, remotes.url(name)])),
    },
    cache: { dir: cacheDir },
  });
  try {
    for (const kind of hosts) results.push(await smokeHost(kind, 'url'));
    console.log(`[smoke:url] remote server answered ${remotes.requests()} requests`);
    results.push(remotes.requests() > 0);

    await remotes.close();
    await session.defaultSession.clearCache();
    for (const kind of hosts) results.push(await smokeHost(kind, 'offline', { expectCache: true }));
  } finally {
    unhandle();
    await remotes.close().catch(() => {});
    await rm(cacheDir, { recursive: true, force: true });
  }
  return results.every(Boolean);
}

app.whenReady().then(async () => {
  if (isSmoke) {
    app.exit((await smoke()) ? 0 : 1);
    return;
  }

  if (!isDev) serveFederatedApps({ apps: localApps });

  await createWindow({ show: true, logPrefix: 'renderer' }).loadURL(hostUrl(hostKind));
});

// Smoke mode opens and destroys windows one at a time; quitting here would end the run early.
app.on('window-all-closed', () => {
  if (!isSmoke) app.quit();
});
