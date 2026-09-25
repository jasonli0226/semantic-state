import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import './pokedex.css'
import PokedexApp from './PokedexApp.tsx'
import { PokedexEngineContext } from './context.ts'
import { createPokedexEngine } from './engine.ts'

const worker = new Worker(new URL('./pokedex.worker.ts', import.meta.url), { type: 'module' })
const engine = createPokedexEngine(worker)
engine.start()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PokedexEngineContext.Provider value={engine}>
      <PokedexApp />
    </PokedexEngineContext.Provider>
  </StrictMode>,
)
