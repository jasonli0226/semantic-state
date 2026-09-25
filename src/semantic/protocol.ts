import type { Item, RankedItem, Vec } from '../core/types.ts'
import type { InteractionKind } from './config.ts'

export type ToWorker =
  | { readonly type: 'init'; readonly items: readonly Item[] }
  | { readonly type: 'reset'; readonly items: readonly Item[] }
  | { readonly type: 'upsert'; readonly items: readonly Item[] }
  | { readonly type: 'interact'; readonly id: string; readonly kind: InteractionKind }
  | { readonly type: 'watch'; readonly query: string }
  | { readonly type: 'scale'; readonly count: number }

export interface EmbeddedVector {
  readonly id: string
  readonly vector: Vec
}

export interface QueryResult {
  readonly ranked: readonly RankedItem[]
  readonly duplicates: readonly (readonly string[])[]
  /** Worker-side ranking time — the "read path" budget. */
  readonly rankMs: number
  readonly itemCount: number
  readonly updatedAt: number
  /** fetch()es the worker made since the model was ready — should stay 0. */
  readonly networkRequests: number
}

export type FromWorker =
  | { readonly type: 'progress'; readonly progress: number }
  | { readonly type: 'ready' }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'embedded'; readonly vectors: readonly EmbeddedVector[]; readonly embedMs: number; readonly synthetic: readonly Item[] }
  | { readonly type: 'queryEmbedded'; readonly query: string; readonly vector: Vec }
  | { readonly type: 'ranked'; readonly query: string; readonly result: QueryResult }
