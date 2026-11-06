import { defineConfig } from '@playwright/test';

// End-to-end tests run against the real API (with the real book and depth-4 search) serving the built web app.
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3101', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://127.0.0.1:3101/api/health',
    timeout: 120_000,
    reuseExistingServer: false,
    env: { PORT: '3101', LOG_LEVEL: 'warn' },
  },
});
