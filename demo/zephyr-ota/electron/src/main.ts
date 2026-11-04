import path from 'node:path';
import {
  federationUrl,
  registerFederationScheme,
  serveFederatedApps,
} from '@module-federation/electron';
import { app, BrowserWindow } from 'electron';

const REMOTES = ['ota_remote_rsbuild', 'ota_remote_vite'];
const isSmoke = process.argv.includes('--smoke');
// Used by rehearse.mjs: after the first check, reload the same window when stdin says so.
const reloadOnStdin = process.argv.includes('--reload-on-stdin');

// Must run before `app` is ready.
registerFederationScheme();

/** Loads the host and waits until every remote renders, one fails, or 20s pass. */
async function smoke(win: BrowserWindow): Promise<boolean> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const state: { versions: Record<string, string>; errors: Record<string, string> } = await win
      .webContents.executeJavaScript(`({
        versions: Object.fromEntries(
          [...document.querySelectorAll('[data-ota-remote]')].map((el) => [el.dataset.otaRemote, el.dataset.otaVersion]),
        ),
        errors: Object.fromEntries(
          [...document.querySelectorAll('[data-ota-error]')].map((el) => [el.dataset.otaError, el.textContent]),
        ),
      })`);
    if (Object.keys(state.versions).length + Object.keys(state.errors).length === REMOTES.length) {
      for (const remote of REMOTES) {
        const error = state.errors[remote];
        console.log(`[smoke] ${remote}: ${error ? `FAIL ${error}` : state.versions[remote]}`);
      }
      return Object.keys(state.errors).length === 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  console.log('[smoke] FAIL timed out waiting for remotes');
  return false;
}

app.whenReady().then(async () => {
  // Only the host is bundled with the app. The remotes come from the network.
  serveFederatedApps({
    apps: { ota_host: path.resolve(import.meta.dirname, '../../host/dist') },
  });

  const win = new BrowserWindow({
    width: 820,
    height: 640,
    show: !isSmoke,
    title: 'Zephyr OTA demo',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.webContents.on('console-message', ({ level, message }) => {
    if (level === 'error') console.log(`[renderer:error] ${message}`);
  });
  await win.loadURL(federationUrl('ota_host', 'index.html'));

  if (!isSmoke) return;
  let ok = await smoke(win);
  if (reloadOnStdin) {
    await new Promise((resolve) => process.stdin.once('data', resolve));
    win.webContents.reload();
    await new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()));
    ok = (await smoke(win)) && ok;
  }
  app.exit(ok ? 0 : 1);
});

app.on('window-all-closed', () => {
  if (!isSmoke) app.quit();
});
