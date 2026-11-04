/**
 * Bundler-agnostic helpers. Safe to import from build tooling (no `electron` import).
 */

/** Default custom protocol scheme used to serve federated bundles inside Electron. */
export const DEFAULT_SCHEME = 'mf';

/** Default host for the custom protocol. Every app shares it, so they share one origin. */
export const DEFAULT_HOST = 'local';

export interface FederationUrlOptions {
  scheme?: string;
  host?: string;
}

/**
 * Turns a Module Federation `name` (e.g. `remote_vite`) into the path segment
 * used on the custom protocol (e.g. `remote-vite`).
 */
export function toAppId(name: string): string {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!id) throw new Error(`Cannot derive an app id from federation name "${name}"`);
  return id;
}

/** Base URL an app is served from in production, e.g. `mf://local/remote-vite/`. */
export function federationBaseUrl(name: string, options: FederationUrlOptions = {}): string {
  const { scheme = DEFAULT_SCHEME, host = DEFAULT_HOST } = options;
  return `${scheme}://${host}/${toAppId(name)}/`;
}

/** URL of a file inside an app, e.g. `federationUrl('remote_vite', 'remoteEntry.js')`. */
export function federationUrl(
  name: string,
  file: string,
  options: FederationUrlOptions = {},
): string {
  return new URL(file.replace(/^\/+/, ''), federationBaseUrl(name, options)).href;
}
