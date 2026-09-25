import type { ReactNode } from 'react'
import type { SemanticStore } from '../store/store.ts'
import { SemanticStoreContext } from './storeContext.ts'

export function SemanticProvider<T>({ store, children }: { store: SemanticStore<T>; children: ReactNode }) {
  return <SemanticStoreContext.Provider value={store as SemanticStore<unknown>}>{children}</SemanticStoreContext.Provider>
}
