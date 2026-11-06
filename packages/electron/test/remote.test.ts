import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';
import {
  CACHE_HEADER,
  createRemoteHandler,
  isRemoteLocation,
  resolveAppUrl,
  UNREACHABLE_FOR_MS,
  type FetchFunction,
  type RemoteHandlerOptions,
} from '../src/remote.ts';

describe('isRemoteLocation', () => {
  it('accepts http(s) URLs and rejects paths', () => {
    expect(isRemoteLocation('https://cdn.example.com/remote/')).toBe(true);
    expect(isRemoteLocation('HTTP://localhost:3001')).toBe(true);
    expect(isRemoteLocation('/apps/remote/dist')).toBe(false);
    expect(isRemoteLocation('C:\\apps\\remote\\dist')).toBe(false);
    expect(isRemoteLocation('file:///apps/remote/dist')).toBe(false);
  });
});

describe('resolveAppUrl', () => {
  const bases = { remote: 'https://cdn.example.com/remote/v1', root: 'http://localhost:3001' };
  const resolve = (url: string) => resolveAppUrl(new URL(url), bases)?.href;

  it('maps paths under the base URL and keeps the query', () => {
    expect(resolve('mf://local/remote/static/js/a.js?t=1')).toBe(
      'https://cdn.example.com/remote/v1/static/js/a.js?t=1',
    );
    expect(resolve('mf://local/root/mf-manifest.json')).toBe(
      'http://localhost:3001/mf-manifest.json',
    );
    expect(resolve('mf://local/remote/')).toBe('https://cdn.example.com/remote/v1/');
  });

  it('rejects unknown apps and paths that leave the base URL', () => {
    expect(resolve('mf://local/other/a.js')).toBeUndefined();
    expect(resolve('mf://local/__proto__/a.js')).toBeUndefined();
  });

  it('rejects paths that escape the base URL', () => {
    // Request URLs arrive normalized, so fake ones whose path still holds the segments.
    const withPath = (pathname: string) => {
      const url = new URL('mf://local/remote/x');
      Object.defineProperty(url, 'pathname', { value: pathname });
      return resolveAppUrl(url, { remote: 'https://a.test/r/' });
    };
    expect(withPath('/remote/x')?.href).toBe('https://a.test/r/x');
    expect(withPath('/remote/../../secret')).toBeUndefined();
    expect(withPath('/remote/%2e%2e/secret')).toBeUndefined();
    expect(withPath('/remote//evil.test/x')).toBeUndefined();
    expect(withPath('/remote///evil.test/x')).toBeUndefined();
  });
});

type Route = RequestListener;

describe('createRemoteHandler', () => {
  let dir: string;
  let server: Server;
  let base: string;
  let routes: Record<string, Route>;
  let hits: Record<string, number>;
  let logs: string[];

  const listen = async () => {
    server = createServer((req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://x').pathname;
      hits[pathname] = (hits[pathname] ?? 0) + 1;
      const route = routes[pathname];
      if (route) route(req, res);
      else res.writeHead(404).end('missing');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  const stop = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'mf-electron-cache-'));
    routes = {};
    hits = {};
    logs = [];
    await listen();
  });

  afterEach(async () => {
    if (server.listening) await stop();
    await rm(dir, { recursive: true, force: true });
  });

  const handler = (options: Partial<RemoteHandlerOptions> = {}) =>
    createRemoteHandler({
      fetch: (url, init) => fetch(url, init),
      cache: { dir, connectTimeout: 300, readTimeout: 300 },
      log: (message) => logs.push(message),
      ...options,
    });
  const get = (handle: ReturnType<typeof handler>, pathname: string, init?: RequestInit) =>
    handle(new Request(`mf://local/remote${pathname}`, init), new URL(pathname, base));

  const entry =
    (body: string): Route =>
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/javascript', 'x-version': body }).end(body);
    };

  it('serves the network response and replays it from the cache when offline', async () => {
    routes['/remoteEntry.js'] = entry('v1');
    const handle = handler();

    const online = await get(handle, '/remoteEntry.js');
    expect(online.status).toBe(200);
    expect(await online.text()).toBe('v1');
    expect(online.headers.get(CACHE_HEADER)).toBeNull();

    await stop();
    const offline = await get(handle, '/remoteEntry.js');
    expect(offline.status).toBe(200);
    expect(await offline.text()).toBe('v1');
    expect(offline.headers.get('content-type')).toBe('text/javascript');
    expect(offline.headers.get('x-version')).toBe('v1');
    expect(offline.headers.get(CACHE_HEADER)).toBe('stale');
  });

  it('survives a restart: the cache lives on disk', async () => {
    routes['/remoteEntry.js'] = entry('v1');
    await get(handler(), '/remoteEntry.js');
    await stop();

    const response = await get(handler(), '/remoteEntry.js');
    expect(await response.text()).toBe('v1');
  });

  it('prefers the network and refreshes the cache', async () => {
    routes['/remoteEntry.js'] = entry('v1');
    const handle = handler();
    await get(handle, '/remoteEntry.js');
    routes['/remoteEntry.js'] = entry('v2');

    expect(await (await get(handle, '/remoteEntry.js')).text()).toBe('v2');
    await stop();
    expect(await (await get(handle, '/remoteEntry.js')).text()).toBe('v2');
  });

  it('serves the cached copy when the remote answers an error, without overwriting it', async () => {
    routes['/remoteEntry.js'] = entry('v1');
    const handle = handler();
    await get(handle, '/remoteEntry.js');

    routes['/remoteEntry.js'] = (_req, res) => res.writeHead(500).end('broken deploy');
    const broken = await get(handle, '/remoteEntry.js');
    expect(broken.status).toBe(200);
    expect(await broken.text()).toBe('v1');
    expect(broken.headers.get(CACHE_HEADER)).toBe('stale');
    expect(logs.join('\n')).toMatch(/answered 500/);

    delete routes['/remoteEntry.js'];
    expect(await (await get(handle, '/remoteEntry.js')).text()).toBe('v1');
  });

  it('passes error responses through when nothing is cached', async () => {
    const response = await get(handler(), '/missing.js');
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('missing');
  });

  it('answers 502 when offline and nothing is cached', async () => {
    await stop();
    const response = await get(handler(), '/remoteEntry.js');
    expect(response.status).toBe(502);
    expect(await response.text()).toMatch(/is not cached/);
  });

  it('ignores the query string in cache keys', async () => {
    routes['/remoteEntry.js'] = entry('v1');
    const handle = handler();
    await get(handle, '/remoteEntry.js?t=1');
    await stop();

    expect(await (await get(handle, '/remoteEntry.js?t=2')).text()).toBe('v1');
  });

  it('falls back after the connect timeout, or answers 504', async () => {
    routes['/slow.js'] = () => {}; // accepts the request, never answers
    const response = await get(handler(), '/slow.js');
    expect(response.status).toBe(504);

    routes['/remoteEntry.js'] = entry('v1');
    const handle = handler();
    await get(handle, '/remoteEntry.js');
    routes['/remoteEntry.js'] = () => {};
    const fallback = await get(handle, '/remoteEntry.js');
    expect(await fallback.text()).toBe('v1');
    expect(logs.join('\n')).toMatch(/no response after 300 ms/);
  });

  it('times out a stalled body but not a slow one', async () => {
    routes['/stalled.js'] = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.write('partial');
    };
    routes['/trickle.js'] = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      let sent = 0;
      const timer = setInterval(() => {
        res.write(String(sent));
        if (++sent === 5) {
          clearInterval(timer);
          res.end();
        }
      }, 150); // 750 ms in total, never 300 ms without data
    };
    const handle = handler();

    expect((await get(handle, '/stalled.js')).status).toBe(504);
    expect(await (await get(handle, '/trickle.js')).text()).toBe('01234');
  });

  it('does not cache a body that fails halfway', async () => {
    routes['/remoteEntry.js'] = entry('v1');
    const handle = handler();
    await get(handle, '/remoteEntry.js');
    routes['/remoteEntry.js'] = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/javascript', 'content-length': '100' });
      res.write('v2-trunc');
      setTimeout(() => res.destroy(), 20);
    };

    expect(await (await get(handle, '/remoteEntry.js')).text()).toBe('v1');
    await stop();
    expect(await (await get(handle, '/remoteEntry.js')).text()).toBe('v1');
  });

  it('skips the network for a while after a failure, when a cached copy exists', async () => {
    let now = 1_000;
    let calls = 0;
    let offline = false;
    const counting: FetchFunction = (url, init) => {
      calls++;
      return offline ? Promise.reject(new TypeError('fetch failed')) : fetch(url, init);
    };
    routes['/a.js'] = entry('a');
    const handle = handler({ fetch: counting, now: () => now });
    await get(handle, '/a.js');

    offline = true;
    expect(await (await get(handle, '/a.js')).text()).toBe('a');
    expect(calls).toBe(2);
    expect(await (await get(handle, '/a.js')).text()).toBe('a');
    expect(calls).toBe(2);
    // Requests with nothing cached still try the network.
    expect((await get(handle, '/b.js')).status).toBe(502);
    expect(calls).toBe(3);

    offline = false;
    now += UNREACHABLE_FOR_MS;
    expect(await (await get(handle, '/a.js')).text()).toBe('a');
    expect(calls).toBe(4);
  });

  it('drops encoding, connection and cookie headers', async () => {
    routes['/remoteEntry.js'] = (_req, res) => {
      res
        .writeHead(200, {
          'content-type': 'text/javascript',
          'content-encoding': 'gzip',
          'set-cookie': 'session=1',
        })
        .end(gzipSync('compressed'));
    };
    const handle = handler();
    const online = await get(handle, '/remoteEntry.js');
    expect(await online.text()).toBe('compressed');
    expect(online.headers.get('content-encoding')).toBeNull();
    expect(online.headers.get('set-cookie')).toBeNull();

    await stop();
    const offline = await get(handle, '/remoteEntry.js');
    expect(await offline.text()).toBe('compressed');
    expect(offline.headers.get('content-encoding')).toBeNull();
  });

  it('does not forward conditional or origin headers', async () => {
    let seen: Record<string, unknown> = {};
    routes['/a.js'] = (req, res) => {
      seen = req.headers;
      res.writeHead(200).end('a');
    };
    await get(handler(), '/a.js', {
      headers: { 'if-none-match': '"x"', origin: 'mf://local', accept: '*/*' },
    });
    expect(seen['if-none-match']).toBeUndefined();
    expect(seen.origin).toBeUndefined();
    expect(seen.accept).toBe('*/*');
  });

  it('only caches GET requests', async () => {
    routes['/api'] = (req, res) => res.writeHead(200).end(req.method);
    const handle = handler();
    expect(await (await get(handle, '/api', { method: 'POST', body: 'x' })).text()).toBe('POST');
    await stop();
    expect((await get(handle, '/api', { method: 'POST', body: 'x' })).status).toBe(502);
    expect((await get(handle, '/api')).status).toBe(502);
  });

  it('leaves no temporary files behind', async () => {
    routes['/a.js'] = entry('a');
    await get(handler(), '/a.js');
    const files = await readdir(dir, { recursive: true });
    expect(files.some((file) => file.includes('.tmp-'))).toBe(false);
  });

  it('proxies without caching when the cache is disabled', async () => {
    routes['/a.js'] = entry('a');
    const handle = handler({ cache: false });
    expect(await (await get(handle, '/a.js')).text()).toBe('a');
    expect(await readdir(dir)).toEqual([]);
  });
});
