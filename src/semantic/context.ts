import { createContext, useContext } from 'react'
import type { SemanticEngine } from './engine.ts'

export const SemanticEngineContext = createContext<SemanticEngine | null>(null)

export function useSemanticEngine(): SemanticEngine {
  const engine = useContext(SemanticEngineContext)
  if (!engine) throw new Error('useSemantic must be used inside <SemanticEngineContext.Provider>')
  return engine
}
