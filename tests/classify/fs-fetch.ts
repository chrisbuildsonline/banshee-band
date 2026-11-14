// A fetchFunc that serves public/ under a fake origin, so TF.js runs its normal HTTP loading code in Node.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_ORIGIN = 'http://banshee.test';
export const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));

export interface RecordedRequest {
  url: string;
  method: string;
}

export interface FsFetch {
  fetchFunc: typeof fetch;
  /** Every request received, in order. */
  requests: RecordedRequest[];
}

/** `override` may answer a path itself (for failure tests); return undefined to serve the file. */
export function createFsFetch(override?: (pathname: string) => Response | undefined): FsFetch {
  const requests: RecordedRequest[] = [];
  const fetchFunc = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    requests.push({ url: url.href, method });
    if (url.origin !== TEST_ORIGIN) throw new Error(`fs-fetch: request to another origin (${url.origin})`);
    const segments = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    if (segments.includes('..')) throw new Error('fs-fetch: ".." is not allowed in a path');
    const answer = override?.(url.pathname);
    if (answer) return answer;
    const file = join(PUBLIC_DIR, ...segments);
    if (!existsSync(file) || !statSync(file).isFile()) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(readFileSync(file)), { status: 200 });
  };
  return { fetchFunc: fetchFunc as typeof fetch, requests };
}
