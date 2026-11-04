import { pluginModuleFederationElectron } from '@module-federation/electron/rsbuild';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const PORT = 3001;

export default defineConfig({
  server: { port: PORT, strictPort: true },
  dev: { assetPrefix: `http://localhost:${PORT}/` },
  plugins: [
    pluginReact(),
    pluginModuleFederationElectron({
      name: 'remote_rsbuild',
      exposes: { './Counter': './src/Counter.tsx' },
      shared: { react: { singleton: true }, 'react-dom': { singleton: true } },
      dts: false,
    }),
  ],
});
