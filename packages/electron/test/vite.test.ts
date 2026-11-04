import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import { describe, expect, it } from '@rstest/core';
import { electron } from '../src/vite.ts';

function baseFor(plugin: Plugin, command: ConfigEnv['command'], config: UserConfig = {}) {
  const hook = plugin.config as (c: UserConfig, e: ConfigEnv) => UserConfig | undefined;
  return hook(config, { command, mode: 'production' })?.base;
}

describe('electron', () => {
  it('serves production builds from the federation protocol', () => {
    expect(baseFor(electron('remote_vite'), 'build')).toBe('mf://local/remote-vite/');
  });

  it('leaves dev and explicit bases alone', () => {
    expect(baseFor(electron('remote_vite'), 'serve')).toBeUndefined();
    expect(baseFor(electron('remote_vite'), 'build', { base: '/x/' })).toBeUndefined();
  });

  it('can be turned off', () => {
    expect(baseFor(electron('remote_vite', { protocol: false }), 'build')).toBeUndefined();
  });
});
