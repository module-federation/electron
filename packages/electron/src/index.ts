/**
 * Electron main-process integration. Build configs should import the URL helpers
 * from `@module-federation/electron/rsbuild` or `/vite` instead: this entry imports `electron`.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, net, protocol } from 'electron';
import {
  createRemoteHandler,
  isRemoteLocation,
  resolveAppUrl,
  type RemoteCacheOptions,
} from './remote.ts';
import { resolveAppFile } from './resolve.ts';
import { DEFAULT_HOST, DEFAULT_SCHEME, toAppId } from './url.ts';

export { CACHE_HEADER, type RemoteCacheOptions } from './remote.ts';
export { resolveAppFile } from './resolve.ts';
export {
  DEFAULT_HOST,
  DEFAULT_SCHEME,
  federationBaseUrl,
  federationUrl,
  toAppId,
  type FederationUrlOptions,
} from './url.ts';

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
  /**
   * Map of federation `name` (or app id) to the directory holding its build output,
   * or the http(s) URL it is deployed to.
   */
  apps: Record<string, string>;
  /**
   * Offline cache for apps served from a URL. Pass `false` to proxy them without caching.
   * By default responses are cached in `<sessionData>/module-federation`.
   */
  cache?: false | Partial<RemoteCacheOptions>;
}

/**
 * Serves each app on `<scheme>://<host>/<appId>/`, from its build directory or from the
 * URL it is deployed to. Call after `app.whenReady()`. Returns a function that unregisters
 * the handler.
 */
export function serveFederatedApps(options: ServeFederatedAppsOptions): () => void {
  const scheme = options.scheme ?? DEFAULT_SCHEME;
  const host = options.host ?? DEFAULT_HOST;
  const dirs: Record<string, string> = {};
  const urls: Record<string, string> = {};
  for (const [name, location] of Object.entries(options.apps)) {
    (isRemoteLocation(location) ? urls : dirs)[toAppId(name)] = location;
  }
  const fetchRemote = createRemoteHandler({
    fetch: (url, init) => net.fetch(url, init),
    cache:
      options.cache === false
        ? false
        : {
            ...options.cache,
            dir: options.cache?.dir ?? path.join(app.getPath('sessionData'), 'module-federation'),
          },
  });

  protocol.handle(scheme, async (request) => {
    const url = new URL(request.url);
    if (url.host === host) {
      const upstream = resolveAppUrl(url, urls);
      if (upstream) return fetchRemote(request, upstream);
      const file = resolveAppFile(url.pathname, dirs);
      if (file) return net.fetch(pathToFileURL(file).href);
    }
    return new Response('Not found', { status: 404 });
  });

  return () => protocol.unhandle(scheme);
}
