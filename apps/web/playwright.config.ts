import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    // Defaults to `pnpm dev` for local runs. CI (e.g. the "Accessibility (axe
    // runtime)" job) sets PLAYWRIGHT_WEB_SERVER_CMD='pnpm start' to serve the
    // production build instead, so the a11y gate runs against the real built app.
    command: process.env.PLAYWRIGHT_WEB_SERVER_CMD ?? 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // Serving a production build (or a cold `next dev`) can be slow to boot.
    timeout: 180_000,
  },
});
