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
  const unit = (x: number, y: number) => new Float32Array([x, y])
  const vectors = new Map([
    [1, unit(1, 0)],
    [2, unit(0, 1)],
    [3, unit(0.6, 0.8)],
  ])

  it('seeds from the article most similar to the query itself', () => {
    // (0.8, 0.6) is closest to article 3 (0.6, 0.8): 0.96, ahead of article 1: 0.8. Float32, so toBeCloseTo.
    const pick = pickSearchSeed(unit(0.8, 0.6), vectors, 0.3)
    expect(pick).toMatchObject({ kind: 'seed', id: 3 })
    expect(pick.kind === 'seed' && pick.similarity).toBeCloseTo(0.96)
  })

  it('reports weak when even the best article is below the threshold', () => {
    expect(pickSearchSeed(unit(-1, 0), vectors, 0.3)).toEqual({ kind: 'weak' })
  })

  it('reports weak when there are no articles', () => {
    expect(pickSearchSeed(unit(1, 0), new Map(), 0.3)).toEqual({ kind: 'weak' })
  })
})
