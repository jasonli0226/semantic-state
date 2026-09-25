import type { AttentionState, InterestConfig } from './attention.ts'
import { centroidVector } from './centroid.ts'
import { collapseDuplicates, DEFAULT_DEDUPE_LIMIT, groupDuplicates } from './dedupe.ts'
import { type InterestMatch, bestInterest, collapseGroups, interleaveLanes } from './interests.ts'
import type { FeatureVectors, Id, Reason, Scored, Vec, Weights } from './types.ts'
import { dot } from './vector.ts'

/** What a scorer sees for one candidate. Signals are null when there is nothing to compare with. */
export interface ScoreInput<T> {
  readonly item: T
  readonly id: Id
  /** Cosine similarity between the query and the item's text embedding. */
  readonly querySim: number | null
  /** Centroid mode: similarity to the centroid. Multi mode: best weighted match among interests. */
  readonly interest: InterestMatch | null
  /** Centroid mode: decayed interaction mass. Multi mode: number of interests. */
  readonly history: number
  readonly interacted: boolean
  readonly hasVector: boolean
}

export interface ScoreOutput {
  readonly score: number
  readonly confidence: number
  readonly reason: Reason
}

/** Returns null to leave the item out. */
export type Scorer<T> = (input: ScoreInput<T>) => ScoreOutput | null

/** Share of the score that comes from the query when there are also interests. */
const QUERY_SHARE = 0.6
/** Uncalibrated: maps the blended similarity to a 0..1 confidence for display. */
const CONFIDENCE_FLOOR = 0.2
const CONFIDENCE_SPAN = 0.4
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Query and interests blended 60/40 when both exist; items matching neither are left out. */
export const defaultScorer: Scorer<unknown> = ({ querySim, interest }) => {
  if (querySim === null && interest === null) return null
  const queryShare = querySim === null ? 0 : interest === null ? 1 : QUERY_SHARE
  const fromQuery = querySim === null ? 0 : queryShare * querySim
  const fromInterest = interest === null ? 0 : (1 - queryShare) * interest.score
  const score = fromQuery + fromInterest
  const reason: Reason =
    interest !== null && fromInterest > fromQuery ? { kind: 'interest', becauseOf: interest.becauseOf } : { kind: 'search', becauseOf: null }
  return { score, confidence: clamp01((score - CONFIDENCE_FLOOR) / CONFIDENCE_SPAN), reason }
}

export interface ScoreAllInput<T> {
  readonly items: readonly T[]
  readonly idOf: (item: T) => Id
  readonly features: (id: Id) => FeatureVectors | undefined
  readonly queryVec: Vec | null
  readonly attention: AttentionState
  readonly interests: InterestConfig
  readonly weights: Weights
  readonly scorer: Scorer<T>
}

export function scoreAll<T>(input: ScoreAllInput<T>): Scored[] {
  const { attention, interests } = input
  const centroid = interests.mode === 'centroid' ? centroidVector(attention.centroid) : null
  const exclude = interests.mode === 'multi' && (interests.excludeInteracted ?? true)
  const history = interests.mode === 'centroid' ? attention.centroid.weight : attention.interests.length

  const out: Scored[] = []
  for (const item of input.items) {
    const id = input.idOf(item)
    const interacted = attention.interacted.has(id)
    if (exclude && interacted) continue
    const f = input.features(id)
    const text = f?.text
    const interest: InterestMatch | null = !f
      ? null
      : interests.mode === 'centroid'
        ? centroid && text
          ? { score: dot(text, centroid), becauseOf: null }
          : null
        : bestInterest(f, attention.interests, input.features, input.weights)
    const querySim = input.queryVec && text ? dot(text, input.queryVec) : null
    const result = input.scorer({ item, id, querySim, interest, history, interacted, hasVector: Boolean(text) })
    if (result) out.push({ id, ...result })
  }
  return out.sort((a, b) => b.score - a.score)
}

export type Grouping =
  | { readonly kind: 'key'; readonly of: (id: Id) => Id | undefined }
  | { readonly kind: 'duplicates'; readonly threshold: number; readonly vectorOf: (id: Id) => Vec | undefined; readonly scanLimit?: number }

export interface DisplayOptions {
  readonly group?: Grouping
  /** Interleave interest lanes (multi mode). */
  readonly lanes: boolean
  readonly limit: number
}

/** The read path after scoring: fold groups → interest lanes → top `limit`. */
export function rankForDisplay(scored: readonly Scored[], opts: DisplayOptions): { ranked: Scored[]; extras: Map<Id, number> } {
  let ranked: readonly Scored[] = scored
  let extras = new Map<Id, number>()
  if (opts.group?.kind === 'key') {
    ;({ ranked, extras } = collapseGroups(scored, opts.group.of))
  } else if (opts.group?.kind === 'duplicates') {
    const order = scored.map((s) => s.id)
    const groups = groupDuplicates(order, opts.group.vectorOf, opts.group.threshold, opts.group.scanLimit ?? DEFAULT_DEDUPE_LIMIT)
    const visible = new Set(collapseDuplicates(order, groups))
    ranked = scored.filter((s) => visible.has(s.id))
    extras = new Map(groups.map((g) => [g[0], g.length - 1]))
  }
  const ordered = opts.lanes ? interleaveLanes(ranked) : [...ranked]
  return { ranked: ordered.slice(0, opts.limit), extras }
}

export interface SimilarInput<T> {
  readonly items: readonly T[]
  readonly idOf: (item: T) => Id
  readonly features: (id: Id) => FeatureVectors | undefined
  readonly weights: Weights
  /** Items sharing the target's group (e.g. its evolution family) are skipped; one result per group. */
  readonly groupOf?: (id: Id) => Id | undefined
}

/** Nearest neighbours of one item by weighted feature similarity. */
export function similarTo<T>(targetId: Id, input: SimilarInput<T>, k: number): Scored[] {
  const targetGroup = input.groupOf?.(targetId)
  const items = input.items.filter((item) => {
    const id = input.idOf(item)
    return id !== targetId && (targetGroup === undefined || input.groupOf?.(id) !== targetGroup)
  })
  const scored = scoreAll({
    ...input,
    items,
    queryVec: null,
    attention: { centroid: { sum: null, weight: 0 }, interests: [{ id: targetId, weight: 1 }], interacted: new Set() },
    interests: { mode: 'multi' },
    scorer: defaultScorer,
  })
  const group: Grouping | undefined = input.groupOf ? { kind: 'key', of: input.groupOf } : undefined
  return rankForDisplay(scored, { group, lanes: false, limit: k }).ranked
}
