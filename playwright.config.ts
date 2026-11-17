import { defineConfig, devices } from '@playwright/test';

// Own port so other repos' dev servers on 5173 never block or leak into e2e.
const url = 'http://localhost:5287';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: true,
  reporter: 'list',
  use: {
    baseURL: url,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun run dev --port 5287',
    url,
    reuseExistingServer: false,
  },
});
