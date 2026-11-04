import { federationElectron } from '@module-federation/electron/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { withZephyr } from 'vite-plugin-zephyr';

const deployToZephyr = process.env.ZEPHYR_DEPLOY === 'true';

export default defineConfig({
  server: { port: 4002, strictPort: true },
  define: {
    __DEMO_VERSION__: JSON.stringify(process.env.DEMO_VERSION ?? 'v1'),
    __BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  // Zephyr serves this remote from its own URL, so asset URLs must stay relative to it
  // rather than point at the `mf://` protocol the bundled host uses.
  experimental: {
    renderBuiltUrl: () => ({ relative: true }),
  },
  plugins: [
    react(),
    federationElectron(
      {
        name: 'ota_remote_vite',
        filename: 'remoteEntry.js',
        manifest: true,
        exposes: { './Card': './src/Card.tsx' },
        shared: { react: { singleton: true }, 'react-dom': { singleton: true } },
        dts: false,
      },
      { electron: { protocol: false } },
    ),
    // Published zephyr plugins (1.7.0) have no skip mode yet, so only add the plugin when deploying.
    ...(deployToZephyr ? [withZephyr()] : []),
  ],
});
