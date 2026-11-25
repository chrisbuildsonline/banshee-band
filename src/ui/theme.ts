// Theme control shared by every page: sets data-theme on <html> and keeps aria-pressed in step.
// Every page ships data-theme="night", so Night is the default with or without JavaScript. A choice is saved in
// localStorage and wins on every page and later visit; with storage blocked it holds for the page only.

export type Theme = 'day' | 'night';

/** The localStorage key of the saved theme choice. */
export const THEME_KEY = 'banshee-band.theme.v1';

interface ThemeStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The saved choice, or null when there is none, it is not a theme, or the store is missing or blocked. */
export function savedTheme(store: ThemeStore | null): Theme | null {
  try {
    const value = store?.getItem(THEME_KEY);
    return value === 'day' || value === 'night' ? value : null;
  } catch {
    return null;
  }
}

/** Saves the choice; a blocked store keeps it for the page only. */
export function saveTheme(store: ThemeStore | null, theme: Theme): void {
  try {
    store?.setItem(THEME_KEY, theme);
  } catch {
    // Storage is blocked: the choice holds until the page is left.
  }
}

function browserStore(): ThemeStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Applies the saved choice and wires every `[data-theme-choice]` button on the page to the theme. */
export function initThemeControl(): void {
  const root = document.documentElement;
  const store = browserStore();
  const options = [...document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')];

  function sync(): void {
    const theme = root.dataset.theme ?? 'night';
    for (const option of options) option.setAttribute('aria-pressed', String(option.dataset.themeChoice === theme));
  }

  const saved = savedTheme(store);
  if (saved) root.dataset.theme = saved;

  for (const option of options) {
    option.addEventListener('click', () => {
      const theme = option.dataset.themeChoice === 'day' ? 'day' : 'night';
      root.dataset.theme = theme;
      saveTheme(store, theme);
      sync();
    });
  }

  sync();
}
