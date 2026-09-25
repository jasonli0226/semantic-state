import { describe, expect, it } from 'vitest'
import { EMPTY_ATTENTION, recordInteraction } from './attention.ts'
import { defaultScorer, rankForDisplay, scoreAll } from './rank.ts'
import type { FeatureVectors, Id } from './types.ts'

interface Mon {
  readonly id: number
  readonly family: number
}
const FIRE = [1, 0, 0]
const WATER = [0, 1, 0]
const mons: Mon[] = [
  { id: 1, family: 1 },
  { id: 2, family: 1 },
  { id: 3, family: 3 },
  { id: 4, family: 4 },
  { id: 5, family: 5 },
  { id: 6, family: 6 },
]
const text = [FIRE, FIRE, FIRE, WATER, WATER, [0, 0, 1]]
const type = [[1, 0], [1, 0], [1, 0], [0, 1], [0, 1], [0, 0]]
const features = new Map<Id, FeatureVectors>(mons.map((m, i) => [m.id, { text: new Float32Array(text[i]), type: new Float32Array(type[i]) }]))
const multi = { mode: 'multi', excludeInteracted: true } as const
const base = {
  items: mons,
  idOf: (m: Mon) => m.id,
  features: (id: Id) => features.get(id),
  weights: { text: 1, type: 1 },
  interests: multi,
  scorer: defaultScorer,
}
const click = (...clicked: number[]) =>
  clicked.reduce((state, id) => recordInteraction(state, id, 'open', features.get(id)?.text, multi), EMPTY_ATTENTION)
const ids = (xs: readonly { id: Id }[]) => xs.map((x) => x.id)

describe('scoreAll with the default scorer', () => {
  it('returns nothing without a query or interests', () => {
    expect(scoreAll({ ...base, queryVec: null, attention: EMPTY_ATTENTION })).toEqual([])
  })

  it('ranks by query similarity', () => {
    const ranked = scoreAll({ ...base, queryVec: new Float32Array(WATER), attention: EMPTY_ATTENTION })
    expect(ids(ranked).slice(0, 2).sort()).toEqual([4, 5])
    expect(ranked[0].reason).toEqual({ kind: 'search', becauseOf: null })
  })

  it('keeps several interests alive, excludes clicked items and explains matches', () => {
    const ranked = scoreAll({ ...base, queryVec: null, attention: click(3, 4) })
    expect(ids(ranked)).not.toContain(3)
    expect(ids(ranked)).not.toContain(4)
    expect(ranked.find((r) => r.id === 5)!.reason).toEqual({ kind: 'interest', becauseOf: 4 })
    expect(ids(ranked.slice(0, 3))).not.toContain(6)
  })

  it('blends query and interests', () => {
    const ranked = scoreAll({ ...base, queryVec: new Float32Array(WATER), attention: click(3) })
    expect(ranked.find((r) => r.id === 1)!.reason.kind).toBe('interest')
    expect(ranked.find((r) => r.id === 4)!.reason.kind).toBe('search')
    expect(ranked.every((r) => r.confidence >= 0 && r.confidence <= 1)).toBe(true)
  })
})

describe('scoreAll with a custom scorer and centroid attention', () => {
  const centroid = { mode: 'centroid', decay: 0.7 } as const
  it('passes the centroid similarity, history and interacted flag to the scorer', () => {
    const attention = recordInteraction(EMPTY_ATTENTION, 1, 'open', features.get(1)!.text, centroid)
    const ranked = scoreAll({
      ...base,
      interests: centroid,
      queryVec: null,
      attention,
      scorer: (input) => ({
        score: (input.interest?.score ?? 0) - (input.interacted ? 10 : 0),
        confidence: input.history,
        reason: { kind: 'interest', becauseOf: null },
      }),
    })
    expect(ranked[0].id).toBe(2) // same text as 1, but 1 was interacted with
    expect(ranked[0].confidence).toBe(1)
    expect(ids(ranked)).toContain(1) // centroid mode does not exclude interacted items
  })

  it('tells the scorer when an item has no vector yet', () => {
    const seen: boolean[] = []
    scoreAll({
      ...base,
      items: [...mons, { id: 99, family: 99 }],
      queryVec: null,
      attention: EMPTY_ATTENTION,
      scorer: (input) => (seen.push(input.hasVector), { score: 0, confidence: 0, reason: { kind: 'fallback', becauseOf: null } }),
    })
    expect(seen.filter((v) => !v)).toHaveLength(1)
  })
})

describe('rankForDisplay', () => {
  it('groups by key, interleaves lanes and applies the limit', () => {
    const scored = scoreAll({ ...base, queryVec: new Float32Array(FIRE), attention: EMPTY_ATTENTION })
    const family = new Map(mons.map((m) => [m.id, m.family]))
    const { ranked, extras } = rankForDisplay(scored, { group: { kind: 'key', of: (id) => family.get(id as number) }, lanes: true, limit: 2 })
    expect(ranked).toHaveLength(2)
    expect(ranked.filter((r) => r.id === 1 || r.id === 2)).toHaveLength(1)
    expect([...extras.values()]).toEqual([1])
  })

  it('groups near-duplicates by vector', () => {
    const scored = scoreAll({ ...base, queryVec: new Float32Array(WATER), attention: EMPTY_ATTENTION })
    const { ranked, extras } = rankForDisplay(scored, {
      group: { kind: 'duplicates', threshold: 0.99, vectorOf: (id) => features.get(id)?.text },
      lanes: false,
      limit: 10,
    })
    expect(ranked.filter((r) => r.id === 4 || r.id === 5)).toHaveLength(1)
    expect([...extras.values()]).toContain(1)
  })
})
