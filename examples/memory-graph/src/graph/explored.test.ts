import { describe, expect, it } from 'vitest'
import { enforceCap, expand, pickSearchSeed, visibleNodes } from './explored.ts'

const neighbours = new Map<number, readonly number[]>([
  [1, [2, 3]],
  [2, [1, 4]],
  [5, [6, 7]],
])

describe('expand', () => {
  it('appends a new id and never mutates the input', () => {
    const order = [1] as const
    expect(expand(order, 2)).toEqual([1, 2])
    expect(order).toEqual([1])
  })

  it('moves an already-expanded id to the end instead of duplicating it', () => {
    expect(expand([1, 2, 5], 1)).toEqual([2, 5, 1])
    expect(expand([1], 1)).toEqual([1])
  })
})

describe('visibleNodes', () => {
  it('lists expanded ids and their neighbours once, with the expanding node as parent', () => {
    expect(visibleNodes([1, 2], neighbours)).toEqual([
      { id: 1, parent: null },
      { id: 2, parent: 1 },
      { id: 3, parent: 1 },
      { id: 4, parent: 2 },
    ])
  })

  it('shows an expanded id before its neighbours have arrived', () => {
    expect(visibleNodes([9], neighbours)).toEqual([{ id: 9, parent: null }])
  })
})

describe('enforceCap', () => {
  it('collapses the oldest expansions until the graph fits', () => {
    // [1,2,5] shows 1,2,3,4,5,6,7 = 7 nodes; dropping 1 leaves 2,1,4,5,6,7 = 6.
    expect(enforceCap([1, 2, 5], neighbours, 6)).toEqual([2, 5])
  })

  it('returns the same order when it already fits', () => {
    const order = [1, 2]
    expect(enforceCap(order, neighbours, 60)).toBe(order)
  })

  it('always keeps the latest expansion, even if it alone is over the cap', () => {
    expect(enforceCap([1, 5], neighbours, 2)).toEqual([5])
  })
})

describe('pickSearchSeed', () => {
  const row = (id: number, confidence: number, kind: 'search' | 'interest') => ({ id, confidence, reason: { kind, becauseOf: null } })

  it('seeds from the best search match', () => {
    expect(pickSearchSeed([row(4, 0.9, 'interest'), row(7, 0.6, 'search')], 0.35)).toEqual({ kind: 'seed', id: 7 })
  })

  it('reports weak when the best search match is below the threshold', () => {
    expect(pickSearchSeed([row(7, 0.2, 'search')], 0.35)).toEqual({ kind: 'weak' })
  })

  it('reports weak when nothing matched the query itself', () => {
    expect(pickSearchSeed([row(4, 0.9, 'interest')], 0.35)).toEqual({ kind: 'weak' })
    expect(pickSearchSeed([], 0.35)).toEqual({ kind: 'weak' })
  })
})
