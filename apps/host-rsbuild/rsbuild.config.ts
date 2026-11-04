import { federationUrl, pluginModuleFederationElectron } from '@module-federation/electron/rsbuild';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const PORT = 3000;
const DEV_PORTS = { remote_rsbuild: 3001, remote_vite: 3002 };

export default defineConfig(({ command }) => {
  const manifest = (name: keyof typeof DEV_PORTS) =>
    command === 'dev'
      ? `${name}@http://localhost:${DEV_PORTS[name]}/mf-manifest.json`
      : `${name}@${federationUrl(name, 'mf-manifest.json')}`;

  return {
    server: { port: PORT, strictPort: true },
    html: { title: 'host_rsbuild' },
    plugins: [
      pluginReact(),
      pluginModuleFederationElectron({
        name: 'host_rsbuild',
        remotes: {
          remote_rsbuild: manifest('remote_rsbuild'),
          remote_vite: manifest('remote_vite'),
        },
        shared: { react: { singleton: true }, 'react-dom': { singleton: true } },
        dts: false,
      }),
    ],
  };
});
