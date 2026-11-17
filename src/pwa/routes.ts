/** How the service worker answers a request: a cached page, a cached file, or not at all (the network). */
export type Route = { kind: 'navigate'; key: string } | { kind: 'asset'; key: string } | { kind: 'ignore' };

const PAGES = new Set(['/index.html', '/band.html', '/styleguide.html']);
const IGNORE: Route = Object.freeze({ kind: 'ignore' });

/**
 * The route of one request. Another origin, a method other than GET, an unreadable URL and `/sw.js` are
 * ignored. A navigation gets a cached page: `/` and unknown paths give `/index.html` (cached index.html
 * first), a known page gives itself, and a path with a file extension other than `.html` is ignored. Any other
 * request is an asset keyed by its path, without query or hash. Never throws. Pure.
 */
export function routeFor(r: { url: string; method: string; mode: string; origin: string }): Route {
  let url: URL;
  try {
    url = new URL(String(r.url));
  } catch {
    return IGNORE;
  }
  if (url.origin !== r.origin || r.method !== 'GET' || url.pathname === '/sw.js') return IGNORE;
  const path = url.pathname;
  if (r.mode === 'navigate') {
    if (PAGES.has(path)) return { kind: 'navigate', key: path };
    const last = path.slice(path.lastIndexOf('/') + 1);
    if (last.includes('.') && !last.endsWith('.html')) return IGNORE;
    return { kind: 'navigate', key: '/index.html' };
  }
  return { kind: 'asset', key: path };
}
