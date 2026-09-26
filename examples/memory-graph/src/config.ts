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
/** A search whose best match is less confident than this doesn't move the graph. */
export const WEAK_MATCH = 0.35
/** Interest lanes, one colour each (the library keeps at most 6 interests). */
export const LANE_COUNT = 6
