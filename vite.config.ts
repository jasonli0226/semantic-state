import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: { rolldownOptions: { input: { main: 'index.html', pokedex: 'pokedex.html' } } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'packages/*/src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['packages/semantic-state/src/**', 'src/core/**', 'src/app/**', 'src/pokedex/{data,features}.ts'],
      exclude: ['**/*.test.*', '**/index.ts', 'packages/semantic-state/src/embedders/**'],
    },
  },
})
