import type { Id, Scored, Vec, Weights } from '../core/types.ts'

export type ToWorker<T> =
  | { readonly type: 'upsert'; readonly items: readonly T[]; readonly vectors?: readonly (readonly [Id, Vec])[] }
  | { readonly type: 'remove'; readonly ids: readonly Id[] }
  | { readonly type: 'reset'; readonly items: readonly T[] }
  | { readonly type: 'interact'; readonly id: Id; readonly kind: string }
  | { readonly type: 'forget'; readonly id: Id }
  | { readonly type: 'clearInterests' }
  | { readonly type: 'watch'; readonly query: string }
  | { readonly type: 'unwatch'; readonly query: string }
  | { readonly type: 'weights'; readonly weights: Weights }
  | { readonly type: 'similar'; readonly id: Id; readonly k: number }

export interface ResultRow<T> extends Scored {
  readonly item: T
}

export interface InterestRow<T> {
  readonly id: Id
  readonly weight: number
  readonly item: T | undefined
}

export interface QueryResult<T> {
  /** Only the top of the ranking crosses to the main thread. */
  readonly ranked: readonly ResultRow<T>[]
  /** Representative id → number of items folded into it (same group or near-duplicates). */
  readonly extras: readonly (readonly [Id, number])[]
  readonly interests: readonly InterestRow<T>[]
  /** Worker-side scoring + grouping time. */
  readonly rankMs: number
  readonly itemCount: number
  readonly updatedAt: number
  /** Worker requests since the model finished loading; null before it has loaded. */
  readonly networkRequests: number | null
}

export type FromWorker<T> =
  | { readonly type: 'ready'; readonly weights: Weights }
  | { readonly type: 'modelProgress'; readonly progress: number }
  | { readonly type: 'modelReady' }
  /** Embedding is unavailable; ranking by existing vectors and interests keeps working. */
  | { readonly type: 'modelError'; readonly message: string }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'results'; readonly query: string; readonly result: QueryResult<T> }
  | { readonly type: 'similar'; readonly id: Id; readonly k: number; readonly results: readonly ResultRow<T>[] }
  | { readonly type: 'embedded'; readonly vectors: readonly (readonly [Id, Vec])[]; readonly embedMs: number }
  | { readonly type: 'queryEmbedded'; readonly query: string; readonly vector: Vec }
