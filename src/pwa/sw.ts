// The service worker, built to /sw.js by the banshee-pwa plugin in vite.config.ts, which replaces the two
// placeholders with the precache list and the cache name. Typed with small local interfaces, because the root
// tsconfig holds the DOM lib, which cannot be mixed with the WebWorker lib in one program.
import { routeFor } from './routes';

interface ExtendableEvent extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  request: Request;
  respondWith(r: Promise<Response>): void;
}
interface MessageEv extends ExtendableEvent {
  data: unknown;
  source: { postMessage(m: unknown): void } | null;
}
interface WorkerScope {
  location: Location;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void>; matchAll(o?: { includeUncontrolled?: boolean; type?: string }): Promise<{ postMessage(m: unknown): void }[]> };
  addEventListener(type: 'install' | 'activate', f: (e: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', f: (e: FetchEvent) => void): void;
  addEventListener(type: 'message', f: (e: MessageEv) => void): void;
}

const sw = self as unknown as WorkerScope;
const PRECACHE = '__PRECACHE_LIST__'.split('\n');
const CACHE = '__CACHE_NAME__';
const DONE = { type: 'precache-complete', cache: CACHE };

/** Fetches every URL one after another (flat memory) and keeps it only when all of them answered ok. */
async function precacheAll(): Promise<void> {
  const cache = await caches.open(CACHE);
  for (const url of PRECACHE) {
    const res = await fetch(url, { cache: 'reload', credentials: 'omit' });
    if (!res.ok) throw new Error(`precache ${res.status}`);
    // A redirected response cannot answer a navigation, so a clean copy is kept instead.
    await cache.put(url, res.redirected ? new Response(await res.blob(), { status: res.status, headers: res.headers }) : res);
  }
}

async function complete(): Promise<boolean> {
  if (!(await caches.has(CACHE))) return false;
  return (await (await caches.open(CACHE)).keys()).length >= PRECACHE.length;
}

async function notifyClients(): Promise<void> {
  for (const c of await sw.clients.matchAll({ includeUncontrolled: true, type: 'window' })) c.postMessage(DONE);
}

sw.addEventListener('install', (e) => {
  e.waitUntil(
    precacheAll().then(
      () => sw.skipWaiting(),
      async (err) => {
        await caches.delete(CACHE); // all or nothing: the next visit tries again
        throw err;
      },
    ),
  );
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('banshee-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => sw.clients.claim())
      .then(notifyClients),
  );
});

sw.addEventListener('message', (e) => {
  const data = e.data as { type?: unknown } | null;
  if (data?.type === 'status') e.waitUntil(complete().then((ok) => ok && e.source?.postMessage(DONE)));
});

sw.addEventListener('fetch', (e) => {
  const r = e.request;
  const route = routeFor({ url: r.url, method: r.method, mode: r.mode, origin: sw.location.origin });
  if (route.kind === 'ignore') return;
  e.respondWith(
    caches
      .open(CACHE)
      .then((c) => c.match(route.key, { ignoreVary: true }))
      .then((hit) => hit ?? fetch(r)),
  );
});
