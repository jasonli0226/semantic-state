import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/semantic/engine.ts', 'src/semantic/useCommitPolicy.ts', 'src/semantic/useActivity.ts', 'src/app/**'],
      exclude: ['**/*.test.*'],
    },
  },
})
