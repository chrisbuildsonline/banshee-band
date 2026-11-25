import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { savedTheme, saveTheme, THEME_KEY } from '../../src/ui/theme';

describe('theme default and saved choice (design-system R5.7a, R5.7b)', () => {
  it('every page opens in Night, with the Night option pressed', () => {
    for (const page of ['index.html', 'band.html', 'styleguide.html']) {
      const html = readFileSync(page, 'utf8');
      expect(html, page).toMatch(/<html lang="en" data-theme="night">/);
      expect(html, page).toMatch(/data-theme-choice="night" aria-pressed="true"/);
      expect(html, page).toMatch(/data-theme-choice="day" aria-pressed="false"/);
    }
  });

  it('reads and writes the saved choice, and survives a blocked or odd store', () => {
    const map = new Map<string, string>();
    const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    expect(THEME_KEY).toBe('banshee-band.theme.v1');
    expect(savedTheme(store)).toBeNull();
    saveTheme(store, 'day');
    expect(map.get(THEME_KEY)).toBe('day');
    expect(savedTheme(store)).toBe('day');
    map.set(THEME_KEY, 'purple');
    expect(savedTheme(store)).toBeNull();
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(savedTheme(blocked)).toBeNull();
    expect(() => saveTheme(blocked, 'night')).not.toThrow();
    expect(savedTheme(null)).toBeNull();
  });
});
