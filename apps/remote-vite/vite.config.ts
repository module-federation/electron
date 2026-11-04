import { federationElectron } from '@module-federation/electron/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const PORT = 3002;

export default defineConfig({
  server: { port: PORT, strictPort: true, origin: `http://localhost:${PORT}` },
  plugins: [
    react(),
    federationElectron({
      name: 'remote_vite',
      filename: 'remoteEntry.js',
      manifest: true,
      exposes: { './Card': './src/Card.tsx' },
      shared: { react: { singleton: true }, 'react-dom': { singleton: true } },
      dts: false,
    }),
  ],
});
