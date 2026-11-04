import {
  type ModuleFederationOptions,
  pluginModuleFederation,
} from '@module-federation/rsbuild-plugin';
import { type FederationUrlOptions, federationBaseUrl } from './url.ts';
import type { RsbuildPlugin, RsbuildPlugins } from '@rsbuild/core';

export type { ModuleFederationOptions };
export {
  DEFAULT_HOST,
  DEFAULT_SCHEME,
  federationBaseUrl,
  federationUrl,
  toAppId,
  type FederationUrlOptions,
} from './url.ts';

export const PLUGIN_ELECTRON_NAME = '@module-federation/electron:rsbuild';

export interface ElectronFederationOptions extends FederationUrlOptions {
  /**
   * Point production asset URLs at the federation protocol
   * (`mf://local/<app-id>/`). Disable when the build is hosted elsewhere,
   * e.g. a CDN. An explicit `output.assetPrefix` always wins.
   * @default true
   */
  protocol?: boolean;
}

export interface PluginOptions {
  electron?: ElectronFederationOptions;
  /** Passed through to `@module-federation/rsbuild-plugin`. */
  rsbuild?: Parameters<typeof pluginModuleFederation>[1];
}

/** Electron defaults layered on top of the Module Federation plugin. */
export function pluginElectron(
  name: string,
  options: ElectronFederationOptions = {},
): RsbuildPlugin {
  const { protocol = true, ...urlOptions } = options;
  return {
    name: PLUGIN_ELECTRON_NAME,
    setup(api) {
      api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) => {
        if (!protocol || api.context.action !== 'build') return config;
        // `config` already has defaults merged in; check what the user actually wrote.
        if (api.getRsbuildConfig('original').output?.assetPrefix !== undefined) return config;
        return mergeRsbuildConfig(config, {
          output: { assetPrefix: federationBaseUrl(name, urlOptions) },
        });
      });
    },
  };
}

/**
 * Module Federation for an Electron renderer built with Rsbuild.
 *
 * ```ts
 * plugins: [pluginModuleFederationElectron({ name: 'host', remotes: { ... } })]
 * ```
 */
export function pluginModuleFederationElectron(
  federation: ModuleFederationOptions,
  options: PluginOptions = {},
): RsbuildPlugins {
  if (!federation.name) {
    throw new Error('[@module-federation/electron] `name` is required');
  }
  return [
    pluginModuleFederation(federation, options.rsbuild),
    pluginElectron(federation.name, options.electron),
  ];
}
