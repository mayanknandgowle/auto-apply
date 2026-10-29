import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: { command: 'node tests/fixtures/server.mjs', url: 'http://127.0.0.1:4177', reuseExistingServer: false },
  use: { trace: 'retain-on-failure' }
});
