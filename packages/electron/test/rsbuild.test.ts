import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createRsbuild,
  type ModifyRsbuildConfigFn,
  mergeRsbuildConfig,
  type RsbuildConfig,
  type RsbuildPlugin,
  type RsbuildPluginAPI,
} from '@rsbuild/core';
import { describe, expect, it } from '@rstest/core';
import { pluginElectron } from '../src/rsbuild.ts';

async function assetPrefixFor(
  plugin: RsbuildPlugin,
  action: 'build' | 'dev',
  config: RsbuildConfig = {},
) {
  let modify: ModifyRsbuildConfigFn | undefined;
  const api = {
    context: { action },
    getRsbuildConfig: () => config,
    modifyRsbuildConfig: (fn: ModifyRsbuildConfigFn) => {
      modify = fn;
    },
  } as unknown as RsbuildPluginAPI;
  await plugin.setup(api);
  const result = await modify?.(config, { mergeRsbuildConfig });
  return (result ?? config).output?.assetPrefix;
}

describe('pluginElectron', () => {
  it('rewrites asset URLs in a real production build', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mfe-rsbuild-'));
    try {
      await writeFile(path.join(cwd, 'index.js'), 'console.log(1);');
      const rsbuild = await createRsbuild({
        cwd,
        config: {
          source: { entry: { index: './index.js' } },
          plugins: [pluginElectron('remote_rsbuild')],
          logLevel: 'silent',
        },
      });
      await rsbuild.build();
      const html = await readFile(path.join(cwd, 'dist/index.html'), 'utf8');
      expect(html).toMatch(/src="mf:\/\/local\/remote-rsbuild\/static\/js\/index\./);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('serves production builds from the federation protocol', async () => {
    expect(await assetPrefixFor(pluginElectron('remote_rsbuild'), 'build')).toBe(
      'mf://local/remote-rsbuild/',
    );
  });

  it('leaves dev and explicit asset prefixes alone', async () => {
    expect(await assetPrefixFor(pluginElectron('remote_rsbuild'), 'dev')).toBeUndefined();
    expect(
      await assetPrefixFor(pluginElectron('remote_rsbuild'), 'build', {
        output: { assetPrefix: 'https://cdn.example.com/' },
      }),
    ).toBe('https://cdn.example.com/');
  });

  it('can be turned off', async () => {
    expect(
      await assetPrefixFor(pluginElectron('remote_rsbuild', { protocol: false }), 'build'),
    ).toBeUndefined();
  });
});
