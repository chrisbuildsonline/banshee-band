// Theme control for the styleguide: sets data-theme on <html> and keeps aria-pressed in step.
// Without this script the page still renders, in the Day theme or the OS dark theme.

const root = document.documentElement;
const options = [...document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')];
const prefersNight = window.matchMedia('(prefers-color-scheme: dark)');

function currentTheme(): string {
  return root.dataset.theme ?? (prefersNight.matches ? 'night' : 'day');
}

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
