import type { Id, Vec } from '../core/types.ts'

/** Keeps item vectors between visits, so unchanged items skip embedding. See indexedDbVectorCache. */
export interface VectorCache {
  /** Cached vectors whose stored text hash matches the given text. Misses are absent from the map. */
  get(entries: readonly (readonly [Id, string])[]): Promise<Map<Id, Vec>>
  set(entries: readonly (readonly [Id, string, Vec])[]): Promise<void>
  /** Removes this cache's entries. */
  clear(): Promise<void>
}
