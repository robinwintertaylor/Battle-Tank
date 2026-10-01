const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: 'tests', reporter: 'list', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: { command: 'node serve.js', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
