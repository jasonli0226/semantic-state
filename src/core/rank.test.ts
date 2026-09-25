import { describe, expect, it } from 'vitest'
import { EMPTY_CENTROID, observe } from './centroid.ts'
import { rankItems } from './rank.ts'
import type { Vec } from './types.ts'

const HOUR = 3_600_000
const NOW = 1_000 * HOUR
const v = (...xs: number[]) => new Float32Array(xs)

const vectors = new Map<string, Vec>([
  ['pay', v(1, 0, 0)],
  ['hire', v(0, 1, 0)],
  ['due', v(0, 0, 1)],
])
const items = [
  { id: 'pay', dueAt: null, createdAt: NOW - 48 * HOUR },
  { id: 'hire', dueAt: null, createdAt: NOW - 48 * HOUR },
  { id: 'due', dueAt: NOW + 2 * HOUR, createdAt: NOW - 48 * HOUR },
]

describe('rankItems', () => {
  it('falls back to deadlines with low confidence when there is no interaction history', () => {
    const ranked = rankItems(items, { getVector: (id) => vectors.get(id), queryVec: null, centroid: EMPTY_CENTROID, now: NOW })
    expect(ranked[0].id).toBe('due')
    expect(ranked.every((r) => r.source === 'fallback')).toBe(true)
    expect(Math.max(...ranked.map((r) => r.confidence))).toBeLessThan(0.3)
  })

  it('ranks items near the attention centroid first', () => {
    const centroid = observe(observe(observe(EMPTY_CENTROID, v(1, 0, 0)), v(1, 0, 0)), v(1, 0, 0))
    const ranked = rankItems(items, { getVector: (id) => vectors.get(id), queryVec: null, centroid, now: NOW })
    expect(ranked[0].id).toBe('pay')
    expect(ranked[0].source).toBe('semantic')
    expect(ranked[0].confidence).toBeGreaterThan(ranked[1].confidence)
  })

  it('grows confidence with interaction history', () => {
    const one = observe(EMPTY_CENTROID, v(1, 0, 0))
    const three = observe(observe(one, v(1, 0, 0)), v(1, 0, 0))
    const ctx = { getVector: (id: string) => vectors.get(id), queryVec: null, now: NOW }
    const c1 = rankItems(items, { ...ctx, centroid: one }).find((r) => r.id === 'pay')!.confidence
    const c3 = rankItems(items, { ...ctx, centroid: three }).find((r) => r.id === 'pay')!.confidence
    expect(c3).toBeGreaterThan(c1)
  })

  it('still ranks items whose embedding is not ready yet, with zero confidence', () => {
    const ranked = rankItems([...items, { id: 'new', dueAt: null, createdAt: NOW }], {
      getVector: (id) => vectors.get(id),
      queryVec: null,
      centroid: observe(EMPTY_CENTROID, v(1, 0, 0)),
      now: NOW,
    })
    const fresh = ranked.find((r) => r.id === 'new')!
    expect(fresh.confidence).toBe(0)
    expect(fresh.source).toBe('fallback')
  })

  it('pushes items the user already opened below similar unseen ones', () => {
    const near = new Map<string, Vec>([
      ['opened', v(1, 0, 0)],
      ['unseen', v(0.9, 0.1, 0)],
    ])
    const pair = [
      { id: 'opened', dueAt: null, createdAt: NOW },
      { id: 'unseen', dueAt: null, createdAt: NOW },
    ]
    const centroid = observe(observe(observe(EMPTY_CENTROID, v(1, 0, 0)), v(1, 0, 0)), v(1, 0, 0))
    const ranked = rankItems(pair, { getVector: (id) => near.get(id), queryVec: null, centroid, now: NOW, seen: new Set(['opened']) })
    expect(ranked.map((r) => r.id)).toEqual(['unseen', 'opened'])
  })
})
