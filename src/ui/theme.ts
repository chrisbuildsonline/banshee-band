// Theme control shared by every page: sets data-theme on <html> and keeps aria-pressed in step.
// Without a choice the OS setting decides; without JavaScript the page still renders in Day or the OS dark theme.

/** Wires every `[data-theme-choice]` button on the page to the theme. */
export function initThemeControl(): void {
  const root = document.documentElement;
  const options = [...document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')];
  const prefersNight = window.matchMedia('(prefers-color-scheme: dark)');

  const currentTheme = (): string => root.dataset.theme ?? (prefersNight.matches ? 'night' : 'day');

  function sync(): void {
    const theme = currentTheme();
    for (const option of options) option.setAttribute('aria-pressed', String(option.dataset.themeChoice === theme));
  }

  for (const option of options) {
    option.addEventListener('click', () => {
      root.dataset.theme = option.dataset.themeChoice;
      sync();
    });
  }

  prefersNight.addEventListener('change', sync);
  sync();
}
