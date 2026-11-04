import path from 'node:path';

/**
 * Maps a request pathname (`/<appId>/<file>`) to an absolute file path inside
 * the matching app directory. Returns `undefined` for unknown apps or for paths
 * that would escape the app directory.
 */
export function resolveAppFile(
  pathname: string,
  apps: Readonly<Record<string, string>>,
): string | undefined {
  const [, appId, ...rest] = decodeURIComponent(pathname).split('/');
  if (!appId || !Object.hasOwn(apps, appId)) return undefined;

  const root = path.resolve(apps[appId] as string);
  const file = path.resolve(root, rest.join('/') || 'index.html');
  if (file !== root && !file.startsWith(root + path.sep)) return undefined;
  return file;
}
