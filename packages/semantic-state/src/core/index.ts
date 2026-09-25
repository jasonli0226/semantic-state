/** Pure functions — no worker, no React. Useful for evals, tests and custom scorers. */
export * from './types.ts'
export { dot, normalize, scale, addScaled } from './vector.ts'
export { type Centroid, EMPTY_CENTROID, DEFAULT_DECAY, observe, centroidVector } from './centroid.ts'
export { similarity } from './similarity.ts'
export {
  type Interest,
  type InterestMatch,
  type MultiInterestOptions,
  DEFAULT_MULTI_INTEREST,
  LANE_DISCOUNT,
  addInterest,
  removeInterest,
  bestInterest,
  interleaveLanes,
  collapseGroups,
} from './interests.ts'
export { type AttentionState, type InterestConfig, EMPTY_ATTENTION, recordInteraction, forgetInteraction } from './attention.ts'
export {
  type ScoreInput,
  type ScoreOutput,
  type Scorer,
  type ScoreAllInput,
  type Grouping,
  type DisplayOptions,
  type SimilarInput,
  defaultScorer,
  scoreAll,
  rankForDisplay,
  similarTo,
} from './rank.ts'
export { DEFAULT_DUPLICATE_THRESHOLD, DEFAULT_DEDUPE_LIMIT, groupDuplicates, collapseDuplicates } from './dedupe.ts'
export { type Committed, type CommitOptions as CommitPlanOptions, type Moves, EMPTY_COMMITTED, planCommit, countMoves } from './commit.ts'
