// Serves the remotes' dist folders the way Zephyr's edge serves deployments, so the OTA
// flow can be rehearsed offline: one origin per remote, `Access-Control-Allow-Origin: *`,
// and remote entries and manifests that always revalidate.
//
//   node edge-server.mjs   ->  http://localhost:4001 (Rsbuild remote), :4002 (Vite remote)
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const here = import.meta.dirname;
const REMOTES = [
  { port: 4001, dir: path.join(here, 'remote-rsbuild/dist') },
  { port: 4002, dir: path.join(here, 'remote-vite/dist') },
];

const TYPES = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml',
};

const isMutableEntry = (name) =>
  name === 'mf-manifest.json' || name === 'zephyr-manifest.json' || name.startsWith('remoteEntry');

for (const { port, dir } of REMOTES) {
  createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();

    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://edge').pathname);
    const file = path.join(dir, pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(dir + path.sep)) return res.writeHead(404).end();
    const info = await stat(file).catch(() => undefined);
    if (!info?.isFile()) return res.writeHead(404).end('Not found');

    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': isMutableEntry(path.basename(file))
        ? 'public, max-age=0, must-revalidate'
        : 'public, max-age=0, s-maxage=1, stale-while-revalidate=86395',
    });
    createReadStream(file).pipe(res);
  }).listen(port, () => {
    console.log(`edge: http://localhost:${port} -> ${path.relative(here, dir)}`);
  });
}
