export type Vec = Float32Array

export type Id = string | number

export type VectorLookup = (id: Id) => Vec | undefined

/** Named vectors per item. `text` is the embedding; anything else (types, stats, …) is app-defined. */
export type FeatureVectors = Readonly<Record<string, Vec>>

/** Relative weight per feature name when comparing two items. */
export type Weights = Readonly<Record<string, number>>

/** Why an item is where it is. */
export interface Reason {
  readonly kind: 'search' | 'interest' | 'fallback'
  /** The interacted item this match is most like (multi-interest matches only). */
  readonly becauseOf: Id | null
}

export interface Scored {
  readonly id: Id
  readonly score: number
  readonly confidence: number
  readonly reason: Reason
}

/** Anything with an id and a score — what the commit planner orders. */
export interface Rankable {
  readonly id: string
  readonly score: number
}

/** AI-derived state is never binary: every value carries how sure we are and why it is there. */
export interface Belief<T> {
  readonly value: T
  readonly confidence: number
  readonly reason: Reason
  /** Items folded into this one (same group, or near-duplicates). */
  readonly groupExtras: number
  readonly updatedAt: number
}

export type CommitPolicy = 'onIdle' | 'manual' | 'live'
