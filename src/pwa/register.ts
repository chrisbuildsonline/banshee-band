/** Marks the page ready for offline use: `window.__bbOffline` for tests and `data-offline-ready` on `<html>`. */
function markReady(): void {
  (window as unknown as { __bbOffline: { ready: boolean } }).__bbOffline = { ready: true };
  document.documentElement.dataset.offlineReady = 'true';
}

/**
 * Registers `/sw.js` after the page loads, in production builds only (the dev server never caches). The worker
 * answers `precache-complete` once the app, the model and the clips are cached; a page that loads under an
 * already active worker asks with `{ type: 'status' }`. A failed registration is ignored: the app works online
 * without the worker.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const container = navigator.serviceWorker;
  container.addEventListener('message', (e: MessageEvent) => {
    if ((e.data as { type?: unknown } | null)?.type === 'precache-complete') markReady();
  });
  window.addEventListener('load', () => {
    container
      .register('/sw.js')
      .then(() => container.ready)
      .then((reg) => reg.active?.postMessage({ type: 'status' }))
      .catch(() => undefined);
  });
}
