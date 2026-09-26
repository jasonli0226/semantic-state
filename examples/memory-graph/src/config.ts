/** ~23MB quantized sentence-transformer. Must match the model used by scripts/build-wiki.ts. */
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'

export const REPO_URL = 'https://github.com/jasonli0226/semantic-state'

/** Neighbours shown per expanded article. */
export const K = 5
/** Most nodes on screen; older expansions are collapsed beyond this. */
export const NODE_CAP = 60
/** The article the graph opens on. */
export const SEED_TITLE = 'Moon'
/** Beliefs per query from the worker — enough to cover every visible node. */
export const RESULT_LIMIT = 60
/**
 * A search whose best article is less similar than this (cosine, query text vs article text) doesn't move the
 * graph. Measured on the Level 3 data: nonsense queries top out around 0.24, real ones start near 0.45.
 */
export const MIN_QUERY_SIMILARITY = 0.3
/** Interest lanes, one colour each (the library keeps at most 6 interests). */
export const LANE_COUNT = 6
