/** semantic-state — main-thread store and shared types. Experimental. */
export { createSemanticStore, normalizeQuery, similarKey, MAX_QUERY_LENGTH } from './store/store.ts'
export type { ModelState, SemanticSnapshot, SemanticStore, WorkerLike } from './store/store.ts'
export type { Belief, CommitPolicy, FeatureVectors, Id, Reason, Scored, Vec, Weights } from './core/types.ts'
export type { InterestRow, QueryResult, ResultRow } from './worker/protocol.ts'
