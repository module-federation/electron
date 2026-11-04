import { federationUrl } from '@module-federation/electron';
import { federationElectron } from '@module-federation/electron/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const PORT = 3003;
const DEV_PORTS = { remote_rsbuild: 3001, remote_vite: 3002 };

export default defineConfig(({ command }) => {
  const manifest = (name: keyof typeof DEV_PORTS) =>
    command === 'serve'
      ? `${name}@http://localhost:${DEV_PORTS[name]}/mf-manifest.json`
      : `${name}@${federationUrl(name, 'mf-manifest.json')}`;

  return {
    server: { port: PORT, strictPort: true },
    plugins: [
      react(),
      federationElectron({
        name: 'host_vite',
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
