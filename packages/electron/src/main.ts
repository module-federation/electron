/**
 * Electron main-process integration. Import from `@module-federation/electron/main`.
 */
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { DEFAULT_HOST, DEFAULT_SCHEME, toAppId } from './index.ts';
import { resolveAppFile } from './resolve.ts';

export { resolveAppFile } from './resolve.ts';

export interface RegisterSchemeOptions {
  scheme?: string;
}

/**
 * Registers the federation scheme as privileged (fetch, CORS, ESM, service workers).
 * Must be called before the `ready` event of `app`.
 */
export function registerFederationScheme(options: RegisterSchemeOptions = {}): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: options.scheme ?? DEFAULT_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        codeCache: true,
      },
    },
  ]);
}

export interface ServeFederatedAppsOptions {
  scheme?: string;
  host?: string;
  /** Map of federation `name` (or app id) to the directory holding its build output. */
  apps: Record<string, string>;
}

/**
 * Serves each app's build output on `<scheme>://<host>/<appId>/`.
 * Call after `app.whenReady()`. Returns a function that unregisters the handler.
 */
export function serveFederatedApps(options: ServeFederatedAppsOptions): () => void {
  const scheme = options.scheme ?? DEFAULT_SCHEME;
  const host = options.host ?? DEFAULT_HOST;
  const apps = Object.fromEntries(
    Object.entries(options.apps).map(([name, dir]) => [toAppId(name), dir]),
  );

  protocol.handle(scheme, async (request) => {
    const url = new URL(request.url);
    const file = url.host === host ? resolveAppFile(url.pathname, apps) : undefined;
    if (!file) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });

  return () => protocol.unhandle(scheme);
}
