import { defineConfig, devices } from '@playwright/test';

// Own ports so other repos' dev servers on 5173 never block or leak into e2e: the dev server on 5287, and a
// production build under `vite preview` on 5288 for the service worker and offline tests.
const url = 'http://localhost:5287';
const preview = 'http://localhost:5288';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: true,
  reporter: 'list',
  use: {
    baseURL: url,
  },
  projects: [
    { name: 'chromium', testIgnore: /offline\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'offline', testMatch: /offline\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: preview } },
  ],
  webServer: [
    {
      command: 'bun run dev --port 5287',
      url,
      reuseExistingServer: false,
    },
    {
      command: 'bun run build && bunx vite preview --port 5288 --strictPort',
      url: preview,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
