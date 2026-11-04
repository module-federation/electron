import path from 'node:path';
import { describe, expect, it } from '@rstest/core';
import { federationBaseUrl, federationUrl, toAppId } from '../src/url.ts';
import { resolveAppFile } from '../src/resolve.ts';

describe('toAppId', () => {
  it('normalizes federation names into URL-safe ids', () => {
    expect(toAppId('remote_vite')).toBe('remote-vite');
    expect(toAppId('@scope/Remote')).toBe('scope-remote');
  });

  it('rejects names with no usable characters', () => {
    expect(() => toAppId('__')).toThrow();
  });
});

describe('federationUrl', () => {
  it('builds URLs on the default scheme and host', () => {
    expect(federationBaseUrl('remote_vite')).toBe('mf://local/remote-vite/');
    expect(federationUrl('remote_vite', '/remoteEntry.js')).toBe(
      'mf://local/remote-vite/remoteEntry.js',
    );
  });

  it('respects a custom scheme and host', () => {
    expect(federationBaseUrl('host', { scheme: 'app', host: 'bundle' })).toBe('app://bundle/host/');
  });
});

describe('resolveAppFile', () => {
  const root = path.resolve('/apps/remote');
  const apps = { remote: root };

  it('resolves files inside the app directory', () => {
    expect(resolveAppFile('/remote/remoteEntry.js', apps)).toBe(path.join(root, 'remoteEntry.js'));
    expect(resolveAppFile('/remote/', apps)).toBe(path.join(root, 'index.html'));
  });

  it('rejects unknown apps and path traversal', () => {
    expect(resolveAppFile('/other/index.html', apps)).toBeUndefined();
    expect(resolveAppFile('/remote/../secret.txt', apps)).toBeUndefined();
    expect(resolveAppFile('/remote/%2e%2e/secret.txt', apps)).toBeUndefined();
    expect(resolveAppFile('/toString/x', apps)).toBeUndefined();
  });
});
