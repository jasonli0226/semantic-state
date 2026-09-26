import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Use semantic-state's TypeScript source from the workspace (no library build needed in dev).
  resolve: { conditions: ['source', ...defaultClientConditions] },
  worker: { format: 'es' },
})
