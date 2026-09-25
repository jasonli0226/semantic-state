import react from '@vitejs/plugin-react'
import { defaultClientConditions } from 'vite'
import { defineConfig } from 'vitest/config'

/** One test run for the library and every example. */
export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ['source', ...defaultClientConditions] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test-setup.ts'],
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'examples/*/src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['packages/semantic-state/src/**', 'examples/inbox/src/{core,app}/**', 'examples/pokedex/src/{data,features}.ts'],
      exclude: ['**/*.test.*', '**/index.ts', 'packages/semantic-state/src/embedders/**'],
    },
  },
})
