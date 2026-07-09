const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,  // Sequential — avoid interference
  retries: 0,
  workers: 1,            // Single worker for security tests
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results.json' }],
  ],
  use: {
    baseURL: 'https://sai.seple.in',
    headless: false,     // Watch the tests run
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    trace: 'on-first-retry',
    actionTimeout: 10000,
    navigationTimeout: 15000,
    // Ignore HTTPS errors if testing on staging
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'security-tests',
      use: { browserName: 'chromium' },
    },
  ],
});
