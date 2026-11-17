import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { routeFor } from '../../src/pwa/routes';

const O = 'http://localhost:5288';
const nav = (path: string) => routeFor({ url: O + path, method: 'GET', mode: 'navigate', origin: O });
const get = (url: string, method = 'GET') => routeFor({ url, method, mode: 'cors', origin: O });

describe('routeFor', () => {
  it('answers navigations with a cached page, index.html first', () => {
    expect(nav('/')).toEqual({ kind: 'navigate', key: '/index.html' });
    expect(nav('/index.html')).toEqual({ kind: 'navigate', key: '/index.html' });
    expect(nav('/band.html')).toEqual({ kind: 'navigate', key: '/band.html' });
    expect(nav('/styleguide.html')).toEqual({ kind: 'navigate', key: '/styleguide.html' });
    expect(nav('/nowhere')).toEqual({ kind: 'navigate', key: '/index.html' });
    expect(nav('/old.html?x=1')).toEqual({ kind: 'navigate', key: '/index.html' });
    expect(nav('/a/b.png')).toEqual({ kind: 'ignore' });
  });

  it('keys assets by path, without query or hash', () => {
    expect(get(`${O}/a/b.png?v=2#x`)).toEqual({ kind: 'asset', key: '/a/b.png' });
    expect(get(`${O}/models/yamnet/model.json`)).toEqual({ kind: 'asset', key: '/models/yamnet/model.json' });
  });

  it('ignores other methods, other origins, the worker and junk', () => {
    expect(get(`${O}/clips/manifest.json`, 'POST')).toEqual({ kind: 'ignore' });
    expect(get('https://example.com/x.js')).toEqual({ kind: 'ignore' });
    expect(get(`${O}/sw.js`)).toEqual({ kind: 'ignore' });
    expect(get('not a url')).toEqual({ kind: 'ignore' });
    expect(get('')).toEqual({ kind: 'ignore' });
  });

  it('never throws and never answers for another origin', () => {
    fc.assert(
      fc.property(fc.oneof(fc.webUrl(), fc.string()), fc.constantFrom('GET', 'POST', 'HEAD'), fc.constantFrom('navigate', 'cors', 'no-cors'), (url, method, mode) => {
        const r = routeFor({ url, method, mode, origin: O });
        return r.kind === 'ignore' || new URL(url).origin === O;
      }),
      { seed: 4, numRuns: 200 },
    );
  });
});
