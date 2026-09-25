import { describe, expect, it } from 'vitest'
import { buildFeatures } from './features.ts'
import { addInterest, collapseFamilies, interleaveInterests, rankForDisplay, rankPokedex, removeInterest, similarTo } from './rank.ts'
import type { Pokemon, PokemonType } from './types.ts'

const mon = (id: number, types: PokemonType[], familyId = id): Pokemon => ({
  id,
  name: `m${id}`,
  genus: '',
  types,
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 + id },
  generation: 1,
  color: 'red',
  habitat: null,
  familyId,
  legendary: false,
  mythical: false,
  flavor: '',
})

// Text space: axis 0 = "fire", axis 1 = "water", axis 2 = "electric".
const FIRE = new Float32Array([1, 0, 0])
const WATER = new Float32Array([0, 1, 0])
const pokedex = [
  mon(1, ['fire'], 1),
  mon(2, ['fire'], 1), // same family as 1
  mon(3, ['fire'], 3),
  mon(4, ['water'], 4),
  mon(5, ['water'], 5),
  mon(6, ['electric'], 6),
]
const text = [FIRE, FIRE, FIRE, WATER, WATER, new Float32Array([0, 0, 1])]
const features = buildFeatures(pokedex, text)
const weights = { text: 1, type: 1, stats: 0 }
const ids = (xs: readonly { id: number }[]) => xs.map((x) => x.id)

describe('interests', () => {
  it('puts the newest click first at full weight and decays the rest', () => {
    const interests = addInterest(addInterest([], 1), 4)
    expect(interests[0]).toEqual({ id: 4, weight: 1 })
    expect(interests[1].id).toBe(1)
    expect(interests[1].weight).toBeLessThan(1)
  })

  it('re-clicking moves an interest back to the front without duplicating it', () => {
    const interests = addInterest(addInterest(addInterest([], 1), 4), 1)
    expect(ids(interests)).toEqual([1, 4])
    expect(interests[0].weight).toBe(1)
  })

  it('forgets old clicks after enough newer ones', () => {
    const interests = [1, 2, 3, 4, 5, 6, 7, 8, 9].reduce(addInterest, [] as ReturnType<typeof addInterest>)
    expect(interests.length).toBeLessThanOrEqual(6)
    expect(ids(interests)).not.toContain(1)
  })

  it('can remove one interest', () => {
    expect(ids(removeInterest(addInterest(addInterest([], 1), 4), 1))).toEqual([4])
  })
})

describe('rankPokedex', () => {
  it('returns nothing until there is a search or an interest', () => {
    expect(rankPokedex(pokedex, { features, interests: [], queryVec: null, weights })).toEqual([])
  })

  it('ranks by free-text similarity for a search', () => {
    const ranked = rankPokedex(pokedex, { features, interests: [], queryVec: WATER, weights })
    expect(ids(ranked).slice(0, 2).sort()).toEqual([4, 5])
    expect(ranked[0].reason).toEqual({ kind: 'search', becauseOf: null })
  })

  it('keeps several interests alive at once instead of averaging them away', () => {
    const interests = addInterest(addInterest([], 3), 4)
    const top = ids(rankPokedex(pokedex, { features, interests, queryVec: null, weights }).slice(0, 3))
    expect(top).toContain(5) // like the water click
    expect(top.some((id) => id === 1 || id === 2)).toBe(true) // like the fire click
    expect(top).not.toContain(6)
  })

  it('explains which click an interest match comes from', () => {
    const ranked = rankPokedex(pokedex, { features, interests: addInterest([], 4), queryVec: null, weights })
    expect(ranked[0]).toMatchObject({ id: 5, reason: { kind: 'interest', becauseOf: 4 } })
  })

  it('excludes Pokémon the user already clicked', () => {
    const ranked = rankPokedex(pokedex, { features, interests: addInterest([], 4), queryVec: null, weights })
    expect(ids(ranked)).not.toContain(4)
  })

  it('blends search and interests', () => {
    const ranked = rankPokedex(pokedex, { features, interests: addInterest([], 3), queryVec: WATER, weights })
    expect(ranked.find((r) => r.id === 1)!.reason.kind).toBe('interest')
    expect(ranked.find((r) => r.id === 4)!.reason.kind).toBe('search')
    expect(ranked.every((r) => r.confidence >= 0 && r.confidence <= 1)).toBe(true)
  })
})

describe('collapseFamilies', () => {
  it('keeps the best member of each evolution family and counts the rest', () => {
    const ranked = rankPokedex(pokedex, { features, interests: [], queryVec: FIRE, weights })
    const { ranked: collapsed, familyExtras } = collapseFamilies(ranked, new Map(pokedex.map((p) => [p.id, p.familyId])))
    const fireFamily = collapsed.filter((r) => r.id === 1 || r.id === 2)
    expect(fireFamily).toHaveLength(1)
    expect(familyExtras.get(fireFamily[0].id)).toBe(1)
  })
})

describe('similarTo', () => {
  it('finds the nearest Pokémon outside the clicked one’s own family', () => {
    const similar = similarTo(1, pokedex, features, weights, 2)
    expect(similar[0].id).toBe(3)
    expect(ids(similar)).not.toContain(2)
    expect(similar).toHaveLength(2)
  })
})

describe('interleaveInterests', () => {
  const r = (id: number, score: number, becauseOf: number | null) => ({
    id,
    score,
    confidence: 1,
    reason: { kind: becauseOf === null ? ('search' as const) : ('interest' as const), becauseOf },
  })

  it('stops the newest click from taking every slot', () => {
    // Four strong matches for click 4 (fire), weaker ones for click 7 (water).
    const ranked = [r(1, 0.8, 4), r(2, 0.79, 4), r(3, 0.78, 4), r(5, 0.77, 4), r(8, 0.6, 7), r(9, 0.59, 7)]
    const top4 = interleaveInterests(ranked).slice(0, 4).map((x) => x.reason.becauseOf)
    expect(top4).toContain(7)
    expect(top4.filter((b) => b === 4).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the original order within a lane and loses nothing', () => {
    const ranked = [r(1, 0.9, 4), r(2, 0.5, 4), r(3, 0.4, null)]
    const out = interleaveInterests(ranked)
    expect(out.map((x) => x.id).sort()).toEqual([1, 2, 3])
    expect(out.findIndex((x) => x.id === 1)).toBeLessThan(out.findIndex((x) => x.id === 2))
  })

  it('rewrites scores to the lane-discounted value so any score-sorting consumer keeps the order', () => {
    const ranked = [r(1, 0.8, 4), r(2, 0.79, 4), r(3, 0.78, 4), r(8, 0.6, 7), r(9, 0.59, 7)]
    const out = interleaveInterests(ranked)
    const scores = out.map((x) => x.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect([...out].sort((a, b) => b.score - a.score).map((x) => x.id)).toEqual(out.map((x) => x.id))
  })

  it('is a no-op for a single lane', () => {
    const ranked = [r(1, 0.9, null), r(2, 0.5, null)]
    expect(interleaveInterests(ranked)).toEqual(ranked)
  })
})

describe('rankForDisplay', () => {
  it('collapses families, interleaves interests and applies the limit', () => {
    const { ranked, familyExtras } = rankForDisplay(pokedex, { features, interests: [], queryVec: FIRE, weights }, 2)
    expect(ranked).toHaveLength(2)
    expect(ranked.filter((r) => r.id === 1 || r.id === 2)).toHaveLength(1)
    expect([...familyExtras.values()]).toEqual([1])
  })
})
