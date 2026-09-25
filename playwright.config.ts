import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // First run downloads the embedding model (~23MB) into the browser cache.
  timeout: 180_000,
  use: { baseURL: 'http://localhost:5173', channel: 'chrome', viewport: { width: 1480, height: 1000 } },
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true },
})
