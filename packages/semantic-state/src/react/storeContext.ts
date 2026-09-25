import { createContext, useContext } from 'react'
import type { SemanticStore } from '../store/store.ts'

export const SemanticStoreContext = createContext<SemanticStore<unknown> | null>(null)

export function useSemanticStore<T>(): SemanticStore<T> {
  const store = useContext(SemanticStoreContext)
  if (!store) throw new Error('semantic-state hooks must be used inside <SemanticProvider store={…}>')
  return store as SemanticStore<T>
}
