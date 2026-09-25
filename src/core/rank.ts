import { type Centroid, centroidVector } from './centroid.ts'
import { recency, urgency } from './time.ts'
import type { RankedItem, Vec, VectorLookup } from './types.ts'
import { dot } from './vector.ts'

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

export interface RankContext {
  readonly getVector: VectorLookup
  readonly queryVec: Vec | null
  readonly centroid: Centroid
  readonly now: number
  readonly seen?: ReadonlySet<string>
  readonly weights?: RankWeights
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function rankItems(items: readonly Rankable[], ctx: RankContext): RankedItem[] {
  const w = ctx.weights ?? DEFAULT_WEIGHTS
  const attention = centroidVector(ctx.centroid)
  const history = clamp01(ctx.centroid.weight / HISTORY_SATURATION)

  const ranked = items.map((item): RankedItem => {
    const penalty = ctx.seen?.has(item.id) ? w.seen : 0
    const base = w.urgency * urgency(item.dueAt, ctx.now) + w.recency * recency(item.createdAt, ctx.now) - penalty
    const vec = ctx.getVector(item.id)
    if (!vec) return { id: item.id, score: base, confidence: 0, source: 'fallback' }

    const querySim = ctx.queryVec ? dot(vec, ctx.queryVec) : 0
    if (!attention) {
      return { id: item.id, score: base + w.query * querySim, confidence: FALLBACK_CONFIDENCE, source: 'fallback' }
    }
    const sim = dot(vec, attention)
    return {
      id: item.id,
      score: base + w.query * querySim + w.centroid * history * sim,
      confidence: history * clamp01((sim - CONFIDENCE_SIM_LOW) / CONFIDENCE_SIM_SPAN),
      source: 'semantic',
    }
  })

  return ranked.sort((a, b) => b.score - a.score)
}
