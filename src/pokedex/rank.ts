import type { Vec } from '../core/types.ts'
import { dot } from '../core/vector.ts'
import { type Features, similarity } from './features.ts'
import type { Pokemon, SimilarityWeights } from './types.ts'

/**
 * Multi-interest ranking. A single averaged centroid breaks when interests differ
 * (Squirtle + Charmander averages to neither), so each recent click is kept separately and a
 * candidate scores by its best match among them.
 */
export interface Interest {
  readonly id: number
  readonly weight: number
}

const INTEREST_DECAY = 0.75
const MAX_INTERESTS = 6
const MIN_INTEREST_WEIGHT = 0.15
/** Share of the score that comes from the search box when there are also interests. */
const QUERY_SHARE = 0.6
/** Uncalibrated: maps raw similarity to a 0..1 confidence for display. */
const CONFIDENCE_FLOOR = 0.2
const CONFIDENCE_SPAN = 0.4

export function addInterest(interests: readonly Interest[], id: number): Interest[] {
  const older = interests
    .filter((i) => i.id !== id)
    .map((i) => ({ id: i.id, weight: i.weight * INTEREST_DECAY }))
    .filter((i) => i.weight >= MIN_INTEREST_WEIGHT)
  return [{ id, weight: 1 }, ...older].slice(0, MAX_INTERESTS)
}

export function removeInterest(interests: readonly Interest[], id: number): Interest[] {
  return interests.filter((i) => i.id !== id)
}

export interface RankReason {
  readonly kind: 'search' | 'interest'
  /** The clicked Pokémon this match is most like (interest matches only). */
  readonly becauseOf: number | null
}

export interface RankedPokemon {
  readonly id: number
  readonly score: number
  readonly confidence: number
  readonly reason: RankReason
}

export interface PokedexRankContext {
  readonly features: ReadonlyMap<number, Features>
  readonly interests: readonly Interest[]
  readonly queryVec: Vec | null
  readonly weights: SimilarityWeights
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

function bestInterest(candidate: Features, ctx: PokedexRankContext): { score: number; becauseOf: number | null } {
  return ctx.interests.reduce<{ score: number; becauseOf: number | null }>(
    (best, interest) => {
      const other = ctx.features.get(interest.id)
      if (!other) return best
      const score = interest.weight * similarity(candidate, other, ctx.weights)
      return score > best.score ? { score, becauseOf: interest.id } : best
    },
    { score: 0, becauseOf: null },
  )
}

export function rankPokedex(pokedex: readonly Pokemon[], ctx: PokedexRankContext): RankedPokemon[] {
  const hasQuery = ctx.queryVec !== null
  const hasInterests = ctx.interests.length > 0
  if (!hasQuery && !hasInterests) return []
  const clicked = new Set(ctx.interests.map((i) => i.id))
  const queryShare = hasQuery ? (hasInterests ? QUERY_SHARE : 1) : 0

  return pokedex
    .filter((p) => !clicked.has(p.id) && ctx.features.has(p.id))
    .map((p): RankedPokemon => {
      const f = ctx.features.get(p.id)!
      const fromQuery = ctx.queryVec ? queryShare * dot(f.text, ctx.queryVec) : 0
      const interest = bestInterest(f, ctx)
      const fromInterest = (1 - queryShare) * interest.score
      const score = fromQuery + fromInterest
      const reason: RankReason =
        fromInterest > fromQuery ? { kind: 'interest', becauseOf: interest.becauseOf } : { kind: 'search', becauseOf: null }
      return { id: p.id, score, confidence: clamp01((score - CONFIDENCE_FLOOR) / CONFIDENCE_SPAN), reason }
    })
    .sort((a, b) => b.score - a.score)
}

/** Charmander → Charmeleon → Charizard is one result, not three. */
export function collapseFamilies(ranked: readonly RankedPokemon[], familyOf: ReadonlyMap<number, number>) {
  const representative = new Map<number, number>()
  const familyExtras = new Map<number, number>()
  const kept: RankedPokemon[] = []
  for (const r of ranked) {
    const family = familyOf.get(r.id) ?? -r.id
    const head = representative.get(family)
    if (head === undefined) {
      representative.set(family, r.id)
      kept.push(r)
    } else {
      familyExtras.set(head, (familyExtras.get(head) ?? 0) + 1)
    }
  }
  return { ranked: kept, familyExtras }
}

/** Nearest neighbours of one Pokémon, outside its own evolution family, one per family. */
export function similarTo(
  id: number,
  pokedex: readonly Pokemon[],
  features: ReadonlyMap<number, Features>,
  weights: SimilarityWeights,
  k: number,
): RankedPokemon[] {
  const self = pokedex.find((p) => p.id === id)
  if (!self) return []
  const others = pokedex.filter((p) => p.familyId !== self.familyId)
  const ranked = rankPokedex(others, { features, interests: [{ id, weight: 1 }], queryVec: null, weights })
  const familyOf = new Map(pokedex.map((p) => [p.id, p.familyId]))
  return collapseFamilies(ranked, familyOf).ranked.slice(0, k)
}

/** Each extra pick from the same lane is discounted by this factor. */
const LANE_DISCOUNT = 0.8

/**
 * Greedy re-rank so every interest gets a lane in the top slots. Without it the newest click wins
 * every slot (its weight is highest), and "Squirtle then Charmander" shows only fire types.
 * Output scores are the lane-discounted values, which never increase down the list — so a consumer
 * that sorts by score (the commit policy does) keeps this order.
 */
export function interleaveInterests(ranked: readonly RankedPokemon[]): RankedPokemon[] {
  const lanes = new Map<number | null, RankedPokemon[]>()
  for (const r of ranked) lanes.set(r.reason.becauseOf, [...(lanes.get(r.reason.becauseOf) ?? []), r])
  if (lanes.size <= 1) return [...ranked]

  const queues = [...lanes.values()].map((items) => ({ items, next: 0 }))
  const out: RankedPokemon[] = []
  while (out.length < ranked.length) {
    const adjusted = (q: (typeof queues)[number]) => q.items[q.next].score * LANE_DISCOUNT ** q.next
    const best = queues.filter((q) => q.next < q.items.length).reduce((a, b) => (adjusted(b) > adjusted(a) ? b : a))
    out.push({ ...best.items[best.next], score: adjusted(best) })
    best.next += 1
  }
  return out
}

/** The full read path: rank → one per evolution family → interest lanes → top `limit`. */
export function rankForDisplay(pokedex: readonly Pokemon[], ctx: PokedexRankContext, limit: number) {
  const familyOf = new Map(pokedex.map((p) => [p.id, p.familyId]))
  const { ranked, familyExtras } = collapseFamilies(rankPokedex(pokedex, ctx), familyOf)
  return { ranked: interleaveInterests(ranked).slice(0, limit), familyExtras }
}
