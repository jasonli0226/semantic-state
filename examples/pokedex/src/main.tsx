import { createSemanticStore } from 'semantic-state'
import { SemanticProvider } from 'semantic-state/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './base.css'
import PokedexApp from './PokedexApp.tsx'
import { parsePokedex } from './data.ts'
import './pokedex.css'
import type { Pokemon } from './types.ts'

const semantic = createSemanticStore<Pokemon>(new Worker(new URL('./pokedex.worker.ts', import.meta.url), { type: 'module' }))
const root = createRoot(document.getElementById('root')!)
root.render(<p className="empty">Loading Pokédex…</p>)

async function load(): Promise<Pokemon[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}pokedex/pokedex.json`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parsePokedex(await response.json())
}

load()
  .then((pokedex) => {
    semantic.upsert(pokedex)
    root.render(
      <StrictMode>
        <SemanticProvider store={semantic}>
          <PokedexApp pokedex={pokedex} />
        </SemanticProvider>
      </StrictMode>,
    )
  })
  .catch((error: unknown) => {
    root.render(<p className="banner banner-error">Could not load the Pokédex: {error instanceof Error ? error.message : String(error)}</p>)
  })
