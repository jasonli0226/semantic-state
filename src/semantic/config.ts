/** ~23MB quantized sentence-transformer; runs in WASM (or WebGPU) with no server. */
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'

export const ATTENTION_QUERY = 'what needs my attention right now'

export type InteractionKind = 'open' | 'done'

/** How strongly each interaction pulls the attention centroid. */
export const INTERACTION_STRENGTH: Readonly<Record<InteractionKind, number>> = { open: 1, done: 1.5 }

export type CommitPolicy = 'onIdle' | 'manual' | 'live'

export const COMMIT_DEFAULTS = { policy: 'onIdle' as CommitPolicy, hysteresis: 0.05, idleMs: 2000 }

/** Rows rendered per panel. */
export const VISIBLE_ROWS = 12
