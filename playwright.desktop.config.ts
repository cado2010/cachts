import { defineConfig } from '@playwright/test';

// The desktop app, launched for real: its window, its server process, and closing it.
// Set CACH_DESKTOP_EXE to test a packaged Cach.exe instead of the built app.
export default defineConfig({
  testDir: 'desktop/e2e',
  timeout: 90_000,
  workers: 1,
});
