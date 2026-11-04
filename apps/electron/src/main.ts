import path from 'node:path';
import { federationUrl } from '@module-federation/electron';
import { registerFederationScheme, serveFederatedApps } from '@module-federation/electron/main';
import { app, BrowserWindow } from 'electron';

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

/** Loads one host and waits until every remote renders, one fails, or 15s pass. */
async function smokeHost(kind: HostKind): Promise<boolean> {
  const win = createWindow({ show: false, logPrefix: `renderer:${kind}` });
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
        for (const remote of REMOTES) {
          const error = state.errors[remote];
          console.log(`[smoke] host_${kind} <- ${remote}: ${error ? `FAIL ${error}` : 'ok'}`);
        }
        return Object.keys(state.errors).length === 0;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const body = await win.webContents.executeJavaScript('document.body.innerHTML');
    console.log(`[smoke] host_${kind}: FAIL timed out waiting for remotes. <body>:\n${body}`);
    return false;
  } finally {
    win.destroy();
  }
}

app.whenReady().then(async () => {
  if (!isDev) {
    serveFederatedApps({
      apps: {
        host_rsbuild: dist('host-rsbuild'),
        host_vite: dist('host-vite'),
        remote_rsbuild: dist('remote-rsbuild'),
        remote_vite: dist('remote-vite'),
      },
    });
  }

  if (isSmoke) {
    const results = [];
    for (const kind of Object.keys(HOSTS) as HostKind[]) results.push(await smokeHost(kind));
    app.exit(results.every(Boolean) ? 0 : 1);
    return;
  }

  await createWindow({ show: true, logPrefix: 'renderer' }).loadURL(hostUrl(hostKind));
});

// Smoke mode opens and destroys windows one at a time; quitting here would end the run early.
app.on('window-all-closed', () => {
  if (!isSmoke) app.quit();
});
