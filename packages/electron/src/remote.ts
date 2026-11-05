/**
 * Serves apps deployed to an http(s) URL, with an on-disk cache that stands in for
 * the network when it fails. Must not import `electron`: the fetch function is
 * passed in, so this runs (and is tested) in plain Node.
 *
 * Cache layout, relative to the cache directory:
 *
 * ```text
 * <sha1(origin)>/<sha1(pathname)>   one JSON line with status and headers, then the body
 * ```
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Header added to responses served from the cache. */
export const CACHE_HEADER = 'x-mf-cache';

/** How long an origin is skipped after a network failure, for requests that have a cached copy. */
export const UNREACHABLE_FOR_MS = 30_000;

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Headers not replayed from the upstream response: they describe the original connection,
 * an encoding the fetch already undid, or cookies that do not belong to the `mf://` origin.
 */
const DROPPED_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
  'set-cookie',
]);

/** Request headers sent upstream. Conditional headers are left out: a 304 has no body to cache. */
const FORWARDED_HEADERS = ['accept', 'accept-language', 'content-type'];

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

export type FetchFunction = (url: string, init: RequestInit) => Promise<Response>;

export interface RemoteCacheOptions {
  /** Directory for cached responses. */
  dir: string;
  /** Milliseconds to wait for response headers. Default 10 000. */
  connectTimeout?: number;
  /** Milliseconds the body may stall between chunks. Not a limit on the total download. Default 10 000. */
  readTimeout?: number;
}

export interface RemoteHandlerOptions {
  /** Performs the network request. In Electron, `net.fetch`. */
  fetch: FetchFunction;
  /** Offline cache settings, or `false` to proxy without caching or timeouts. */
  cache: RemoteCacheOptions | false;
  /** Receives fallbacks and cache write failures. Default `console.warn`. */
  log?: (message: string) => void;
  /** Clock, for tests. */
  now?: () => number;
}

/** Fetches `upstream` on behalf of `request`, which is the `mf://` request it stands for. */
export type RemoteHandler = (request: Request, upstream: URL) => Promise<Response>;

/** Whether an `apps` entry is a deployment URL rather than a directory. */
export function isRemoteLocation(location: string): boolean {
  return /^https?:\/\//i.test(location);
}

/**
 * Maps a request URL (`<scheme>://<host>/<appId>/<path>?<query>`) to the matching URL
 * under the app's base URL. Returns `undefined` for unknown apps or for paths that would
 * leave the base URL.
 */
export function resolveAppUrl(
  requestUrl: URL,
  bases: Readonly<Record<string, string>>,
): URL | undefined {
  const [, appId, ...rest] = requestUrl.pathname.split('/');
  if (!appId || !Object.hasOwn(bases, appId)) return undefined;

  const base = new URL(bases[appId] as string);
  base.search = '';
  base.hash = '';
  if (!base.pathname.endsWith('/')) base.pathname += '/';

  const target = new URL(rest.join('/') + requestUrl.search, base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) return undefined;
  return target;
}

interface Fetched {
  status: number;
  headers: [string, string][];
  body: Uint8Array;
}

class FetchFailure extends Error {
  constructor(
    message: string,
    readonly timedOut: boolean,
  ) {
    super(message);
  }
}

export function createRemoteHandler(options: RemoteHandlerOptions): RemoteHandler {
  const { fetch, cache } = options;
  const log = options.log ?? ((message: string) => console.warn(`[module-federation] ${message}`));
  const now = options.now ?? Date.now;

  if (!cache) {
    return (request, upstream) => fetch(upstream.href, upstreamInit(request));
  }

  const connectTimeout = cache.connectTimeout ?? DEFAULT_TIMEOUT_MS;
  const readTimeout = cache.readTimeout ?? DEFAULT_TIMEOUT_MS;
  const unreachableSince = new Map<string, number>();
  const isUnreachable = (origin: string) => {
    const since = unreachableSince.get(origin);
    return since !== undefined && now() - since < UNREACHABLE_FOR_MS;
  };

  return async (request, upstream) => {
    const cacheable = request.method === 'GET';
    const file = cacheFile(cache.dir, upstream);
    const stale = async (reason: string) => {
      if (!cacheable) return undefined;
      const cached = await readCached(file);
      if (cached) log(`${upstream.href} ${reason}, serving the cached copy`);
      return cached && toResponse(cached, 'stale');
    };

    if (cacheable && isUnreachable(upstream.origin)) {
      const cached = await readCached(file);
      if (cached) return toResponse(cached, 'stale');
    }

    let fetched: Fetched;
    try {
      fetched = await fetchFully(fetch, upstream, request, connectTimeout, readTimeout);
    } catch (error) {
      unreachableSince.set(upstream.origin, now());
      const failure =
        error instanceof FetchFailure ? error : new FetchFailure(String(error), false);
      return (
        (await stale(`failed (${failure.message})`)) ??
        text(
          failure.timedOut ? 504 : 502,
          `${upstream.href} failed (${failure.message}) and is not cached`,
        )
      );
    }

    unreachableSince.delete(upstream.origin);
    if (fetched.status >= 200 && fetched.status < 300) {
      if (cacheable) {
        await writeCached(file, fetched).catch((error: unknown) =>
          log(`failed to cache ${upstream.href}: ${String(error)}`),
        );
      }
      return toResponse(fetched);
    }
    return (await stale(`answered ${fetched.status}`)) ?? toResponse(fetched);
  };
}

function upstreamInit(request: Request): RequestInit {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const init: RequestInit & { duplex?: 'half' } = { method: request.method, headers };
  if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }
  return init;
}

/**
 * Fetches the whole response. Throws a {@link FetchFailure} when the request fails, the
 * headers take longer than `connectTimeout`, the body stalls for `readTimeout`, or the
 * body fails halfway: a truncated response must not be cached as a success.
 */
async function fetchFully(
  fetch: FetchFunction,
  upstream: URL,
  request: Request,
  connectTimeout: number,
  readTimeout: number,
): Promise<Fetched> {
  const controller = new AbortController();
  const response = await withTimeout(
    fetch(upstream.href, { ...upstreamInit(request), signal: controller.signal }),
    connectTimeout,
    controller,
    'no response',
  );

  const chunks: Uint8Array[] = [];
  const reader = response.body?.getReader();
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await withTimeout(
          reader.read(),
          readTimeout,
          controller,
          'body stalled',
        );
        if (done) break;
        chunks.push(value);
      }
    } catch (error) {
      reader.cancel().catch(() => {});
      throw error;
    }
  }

  return {
    status: response.status,
    headers: [...response.headers].filter(([name]) => !DROPPED_HEADERS.has(name.toLowerCase())),
    body: concat(chunks),
  };
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  controller: AbortController,
  what: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Reject before aborting: the abort also rejects `promise`, and the race must
      // settle with the timeout.
      reject(new FetchFailure(`${what} after ${ms} ms`, true));
      controller.abort();
    }, ms);
  });
  return Promise.race([promise, timeout])
    .catch((error: unknown) => {
      throw error instanceof FetchFailure ? error : new FetchFailure(errorMessage(error), false);
    })
    .finally(() => clearTimeout(timer));
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  // Node's fetch reports "fetch failed" and puts the reason in `cause`.
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const body = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

/** The query string is not part of the key, so cache-busting parameters still hit the cache. */
function cacheFile(dir: string, url: URL): string {
  return path.join(dir, sha1(url.origin), sha1(url.pathname));
}

async function readCached(file: string): Promise<Fetched | undefined> {
  let data: Buffer;
  try {
    data = await readFile(file);
  } catch {
    return undefined;
  }
  const newline = data.indexOf(0x0a);
  if (newline < 0) return undefined;
  try {
    const meta = JSON.parse(data.subarray(0, newline).toString('utf8')) as Omit<Fetched, 'body'>;
    return { status: meta.status, headers: meta.headers, body: data.subarray(newline + 1) };
  } catch {
    return undefined;
  }
}

let tmpCounter = 0;

/** Writes headers and body as one file through a rename, so a crash never leaves a mismatched pair. */
async function writeCached(file: string, fetched: Fetched): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const meta = JSON.stringify({ status: fetched.status, headers: fetched.headers });
  const tmp = `${file}.tmp-${process.pid}-${tmpCounter++}`;
  try {
    await writeFile(tmp, Buffer.concat([Buffer.from(`${meta}\n`), fetched.body]));
    await rename(tmp, file);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

function toResponse(fetched: Fetched, fromCache?: 'stale'): Response {
  const headers = new Headers(fetched.headers);
  if (fromCache) headers.set(CACHE_HEADER, fromCache);
  const body = NULL_BODY_STATUSES.has(fetched.status) ? null : fetched.body;
  return new Response(body, { status: fetched.status, headers });
}

function text(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
