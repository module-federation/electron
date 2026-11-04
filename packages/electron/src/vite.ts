import { federation, type ModuleFederationOptions } from '@module-federation/vite';
import { type FederationUrlOptions, federationBaseUrl } from './url.ts';
import type { Plugin, PluginOption } from 'vite';

export type { ModuleFederationOptions };
export {
  DEFAULT_HOST,
  DEFAULT_SCHEME,
  federationBaseUrl,
  federationUrl,
  toAppId,
  type FederationUrlOptions,
} from './url.ts';

export const PLUGIN_ELECTRON_NAME = '@module-federation/electron:vite';

export interface ElectronFederationOptions extends FederationUrlOptions {
  /**
   * Point production asset URLs at the federation protocol
   * (`mf://local/<app-id>/`). Disable when the build is hosted elsewhere,
   * e.g. a CDN. An explicit `base` always wins.
   * @default true
   */
  protocol?: boolean;
}

export interface PluginOptions {
  electron?: ElectronFederationOptions;
}

/** Electron defaults layered on top of the Module Federation plugin. */
export function electron(name: string, options: ElectronFederationOptions = {}): Plugin {
  const { protocol = true, ...urlOptions } = options;
  return {
    name: PLUGIN_ELECTRON_NAME,
    config(config, { command }) {
      if (!protocol || command !== 'build' || config.base !== undefined) return;
      return { base: federationBaseUrl(name, urlOptions) };
    },
  };
}

/**
 * Module Federation for an Electron renderer built with Vite.
 *
 * ```ts
 * plugins: [federationElectron({ name: 'host', remotes: { ... } })]
 * ```
 */
export function federationElectron(
  options: ModuleFederationOptions,
  pluginOptions: PluginOptions = {},
): PluginOption[] {
  if (!options.name) {
    throw new Error('[@module-federation/electron] `name` is required');
  }
  return [...federation(options), electron(options.name, pluginOptions.electron)];
}
