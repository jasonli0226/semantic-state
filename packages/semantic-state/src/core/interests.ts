import { similarity } from './similarity.ts'
import type { FeatureVectors, Id, Scored, Weights } from './types.ts'

/**
 * Multi-interest: each recent interaction is kept separately and a candidate scores by its best
 * match among them. A single averaged centroid breaks when interests differ (water + fire
 * averages to neither).
 */
export interface Interest {
  readonly id: Id
  readonly weight: number
}

export interface MultiInterestOptions {
  /** Weight multiplier applied to older interests on each new one. */
  readonly decay: number
  readonly max: number
  /** Interests that decay below this are forgotten. */
  readonly minWeight: number
}

export const DEFAULT_MULTI_INTEREST: MultiInterestOptions = { decay: 0.75, max: 6, minWeight: 0.15 }

export function addInterest(interests: readonly Interest[], id: Id, opts: MultiInterestOptions = DEFAULT_MULTI_INTEREST): Interest[] {
  const older = interests
    .filter((i) => i.id !== id)
    .map((i) => ({ id: i.id, weight: i.weight * opts.decay }))
    .filter((i) => i.weight >= opts.minWeight)
  return [{ id, weight: 1 }, ...older].slice(0, opts.max)
}

export function removeInterest(interests: readonly Interest[], id: Id): Interest[] {
  return interests.filter((i) => i.id !== id)
}

export interface InterestMatch {
  readonly score: number
  readonly becauseOf: Id | null
}

export function bestInterest(
  candidate: FeatureVectors,
  interests: readonly Interest[],
  featuresOf: (id: Id) => FeatureVectors | undefined,
  weights: Weights,
): InterestMatch | null {
  if (interests.length === 0) return null
  return interests.reduce<InterestMatch>(
    (best, interest) => {
      const other = featuresOf(interest.id)
      if (!other) return best
      const score = interest.weight * similarity(candidate, other, weights)
      return score > best.score ? { score, becauseOf: interest.id } : best
    },
    { score: 0, becauseOf: null },
  )
}

/** Each extra pick from the same lane is discounted by this factor. */
export const LANE_DISCOUNT = 0.8

/**
 * Greedy re-rank so every interest (lane = reason.becauseOf) gets slots near the top. Output scores
 * are the lane-discounted values, which never increase down the list — so a consumer that sorts by
 * score (the commit policy does) keeps this order.
 */
export function interleaveLanes(ranked: readonly Scored[], discount = LANE_DISCOUNT): Scored[] {
  const lanes = new Map<Id | null, Scored[]>()
  for (const r of ranked) lanes.set(r.reason.becauseOf, [...(lanes.get(r.reason.becauseOf) ?? []), r])
  if (lanes.size <= 1) return [...ranked]

  const queues = [...lanes.values()].map((items) => ({ items, next: 0 }))
  const adjusted = (q: (typeof queues)[number]) => q.items[q.next].score * discount ** q.next
  const out: Scored[] = []
  while (out.length < ranked.length) {
    const best = queues.filter((q) => q.next < q.items.length).reduce((a, b) => (adjusted(b) > adjusted(a) ? b : a))
    out.push({ ...best.items[best.next], score: adjusted(best) })
    best.next += 1
  }
  return out
}

/** One result per group (e.g. an evolution family); `extras` counts the members folded into each. */
export function collapseGroups(ranked: readonly Scored[], groupOf: (id: Id) => Id | undefined) {
  const representative = new Map<Id, Id>()
  const extras = new Map<Id, number>()
  const kept: Scored[] = []
  for (const r of ranked) {
    const group = groupOf(r.id)
    const head = group === undefined ? undefined : representative.get(group)
    if (head === undefined) {
      if (group !== undefined) representative.set(group, r.id)
      kept.push(r)
    } else {
      extras.set(head, (extras.get(head) ?? 0) + 1)
    }
  }
  return { ranked: kept, extras }
}
