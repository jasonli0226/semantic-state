import { describe, expect, it } from 'vitest'
import { expand, pickSearchSeed, trail } from './explored.ts'

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

describe('trail', () => {
  it('keeps the last n expansions, newest last', () => {
    expect(trail([1, 2, 3, 4, 5, 6, 7], 5)).toEqual([3, 4, 5, 6, 7])
    expect(trail([1, 2], 5)).toEqual([1, 2])
  })

  it('re-expanding an article moves it to the front of the trail without duplicating it', () => {
    expect(trail(expand([1, 2, 3], 2), 5)).toEqual([1, 3, 2])
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
