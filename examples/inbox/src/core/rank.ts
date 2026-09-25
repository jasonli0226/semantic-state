import { type Centroid, type Scorer, scoreAll } from 'semantic-state/core'
import { INBOX_INTERESTS } from '../semantic/config.ts'
import { recency, urgency } from './time.ts'
import type { RankedItem, Vec, VectorLookup } from './types.ts'

/**
 * The inbox's scorer: deadlines and freshness always count, the attention centroid counts more as
 * interaction history builds up, and items already opened are pushed down.
 * The worker (via defineSemanticWorker) and the Redux baseline both use it.
 */

export interface RankWeights {
  readonly query: number
  readonly centroid: number
  readonly urgency: number
  readonly recency: number
  /** Subtracted from items the user already opened: attention is for what they have not looked at yet. */
  readonly seen: number
}

export const DEFAULT_WEIGHTS: RankWeights = { query: 0.15, centroid: 1, urgency: 0.35, recency: 0.05, seen: 0.3 }

/** Decayed interaction mass at which the centroid is trusted fully. */
const HISTORY_SATURATION = 2.5
const FALLBACK_CONFIDENCE = 0.15
/** Centroid similarity below this carries no confidence; at LOW + SPAN it is full. */
const CONFIDENCE_SIM_LOW = 0.05
const CONFIDENCE_SIM_SPAN = 0.35

export interface Rankable {
  readonly id: string
  readonly dueAt: number | null
  readonly createdAt: number
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function inboxScorer(now: number, w: RankWeights = DEFAULT_WEIGHTS): Scorer<Rankable> {
  return ({ item, querySim, interest, history, interacted, hasVector }) => {
    const base = w.urgency * urgency(item.dueAt, now) + w.recency * recency(item.createdAt, now) - (interacted ? w.seen : 0)
    if (!hasVector) return { score: base, confidence: 0, reason: { kind: 'fallback', becauseOf: null } }
    const fromQuery = w.query * (querySim ?? 0)
    if (!interest) return { score: base + fromQuery, confidence: FALLBACK_CONFIDENCE, reason: { kind: 'fallback', becauseOf: null } }
    const trust = clamp01(history / HISTORY_SATURATION)
    return {
      score: base + fromQuery + w.centroid * trust * interest.score,
      confidence: trust * clamp01((interest.score - CONFIDENCE_SIM_LOW) / CONFIDENCE_SIM_SPAN),
      reason: { kind: 'interest', becauseOf: null },
    }
  }
}

export interface RankContext {
  readonly getVector: VectorLookup
  readonly queryVec: Vec | null
  readonly centroid: Centroid
  readonly now: number
  readonly seen?: ReadonlySet<string>
  readonly weights?: RankWeights
}

/** Synchronous ranking for the Redux baseline and the headless eval: same scorer as the worker. */
export function rankItems(items: readonly Rankable[], ctx: RankContext): RankedItem[] {
  const scored = scoreAll({
    items,
    idOf: (item) => item.id,
    features: (id) => {
      const text = ctx.getVector(String(id))
      return text ? { text } : undefined
    },
    queryVec: ctx.queryVec,
    attention: { centroid: ctx.centroid, interests: [], interacted: ctx.seen ?? new Set() },
    interests: INBOX_INTERESTS,
    weights: { text: 1 },
    scorer: inboxScorer(ctx.now, ctx.weights),
  })
  return scored.map((s) => ({ id: String(s.id), score: s.score, confidence: s.confidence, source: s.reason.kind === 'interest' ? 'semantic' : 'fallback' }))
}
