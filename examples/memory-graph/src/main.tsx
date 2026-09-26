import { createSemanticStore } from 'semantic-state'
import { SemanticProvider } from 'semantic-state/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { SEED_TITLE } from './config.ts'
import { findSeed } from './data.ts'
import './graph.css'
import { prebuiltSource } from './source.ts'
import type { Article } from './types.ts'

const store = createSemanticStore<Article>(new Worker(new URL('./memory.worker.ts', import.meta.url), { type: 'module' }))
const source = prebuiltSource(`${import.meta.env.BASE_URL}wiki/`)
const root = createRoot(document.getElementById('root')!)

function start() {
  root.render(<p className="status">Loading articles…</p>)
  const started = performance.now()
  source
    .load()
    .then(({ articles, vectors }) => {
      const seed = findSeed(articles, SEED_TITLE)
      store.upsert(articles, vectors ? { vectors } : undefined)
      root.render(
        <StrictMode>
          <SemanticProvider store={store}>
            <App
              articles={articles}
              vectors={new Map((vectors ?? []).map(([id, vector]) => [Number(id), vector]))}
              seedId={seed.id}
              loadMs={Math.round(performance.now() - started)}
            />
          </SemanticProvider>
        </StrictMode>,
      )
    })
    .catch((error: unknown) => {
      root.render(
        <div className="status status-error" role="alert">
          <p>Could not load the articles: {error instanceof Error ? error.message : String(error)}</p>
          <button type="button" onClick={start}>
            Retry
          </button>
        </div>,
      )
    })
}

start()
