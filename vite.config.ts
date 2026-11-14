import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

export default defineConfig({
  server: { port: 5173, strictPort: true },
  build: {
    rolldownOptions: {
      input: {
        main: resolve(root, 'index.html'),
        styleguide: resolve(root, 'styleguide.html'),
      },
    },
  },
});
