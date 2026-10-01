import { defineConfig, devices } from '@playwright/test';
import { BASE } from './scripts/serve.js';

const PORT = 4173;
const SITE = `http://127.0.0.1:${PORT}${BASE}`;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: SITE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node scripts/serve.js',
    url: SITE,
    env: { PORT: String(PORT) },
    reuseExistingServer: !CI,
  },
});
