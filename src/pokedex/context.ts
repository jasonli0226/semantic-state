import { createContext, useContext } from 'react'
import type { PokedexEngine } from './engine.ts'

export const PokedexEngineContext = createContext<PokedexEngine | null>(null)

export function usePokedexEngine(): PokedexEngine {
  const engine = useContext(PokedexEngineContext)
  if (!engine) throw new Error('usePokedex must be used inside <PokedexEngineContext.Provider>')
  return engine
}
