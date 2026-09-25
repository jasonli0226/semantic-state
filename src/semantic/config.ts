import type { InterestConfig } from 'semantic-state/core'

/** ~23MB quantized sentence-transformer; runs in WASM (or WebGPU) with no server. */
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'

export const ATTENTION_QUERY = 'what needs my attention right now'

export type InteractionKind = 'open' | 'done'

/** Inbox: one focus that drifts, so a single decayed centroid; "done" pulls harder than "open". */
export const INBOX_INTERESTS: InterestConfig = { mode: 'centroid', decay: 0.7, strength: { open: 1, done: 1.5 } }

/**
 * Tuned on the demo dataset with all-MiniLM-L6-v2 (scripts/pairs.ts): the true duplicate pair scores
 * ~0.64, the closest non-duplicate ~0.58. Thin margin — small embedding models are weak at this.
 */
export const INBOX_DUPLICATE_THRESHOLD = 0.62

/** Results the worker sends per query. */
export const INBOX_RESULT_LIMIT = 100

/** Rows rendered per panel. */
export const VISIBLE_ROWS = 12
