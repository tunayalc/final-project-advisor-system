import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    headless: true,
  },
  webServer: [
    {
      command: 'node e2e/start-backend.mjs',
      port: 3000,
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: 'npm start -- --host 127.0.0.1',
      port: 5173,
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
