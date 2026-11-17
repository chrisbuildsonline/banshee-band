/** The manifest's icons: 192 and 512 px for any use, and a 512 px maskable one. */
export const MANIFEST_ICONS = Object.freeze([
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]);

/** The web app manifest, from the Day canvas (`background`) and accent (`theme`) tokens. Pure. */
export function buildManifest(colours: { background: string; theme: string }) {
  return {
    name: 'Banshee Band',
    short_name: 'Banshee',
    description: 'Sounds around you as ghosts, buzzes and text. Works offline after the first visit.',
    start_url: '/index.html',
    scope: '/',
    display: 'standalone',
    background_color: colours.background,
    theme_color: colours.theme,
    icons: MANIFEST_ICONS.map((i) => ({ ...i })),
  };
}
