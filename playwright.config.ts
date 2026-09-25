import { defineConfig } from '@playwright/test'

const INBOX = 'http://localhost:5173'
const POKEDEX = 'http://localhost:5174'

export default defineConfig({
  testDir: './e2e',
  // First run downloads the embedding model (~23MB) into the browser cache.
  timeout: 180_000,
  use: { channel: 'chrome', viewport: { width: 1480, height: 1000 } },
  projects: [
    { name: 'inbox', testMatch: 'inbox.spec.ts', use: { baseURL: INBOX } },
    { name: 'pokedex', testMatch: 'pokedex.spec.ts', use: { baseURL: POKEDEX } },
  ],
  webServer: [
    { command: 'npm run dev -w examples/inbox -- --port 5173 --strictPort', url: INBOX, reuseExistingServer: true },
    { command: 'npm run dev -w examples/pokedex -- --port 5174 --strictPort', url: POKEDEX, reuseExistingServer: true },
  ],
})
