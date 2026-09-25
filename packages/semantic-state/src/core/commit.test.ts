import { describe, expect, it } from 'vitest'
import { EMPTY_COMMITTED, countMoves, planCommit } from './commit.ts'

const r = (id: string, score: number) => ({ id, score })
const opts = { hysteresis: 0.1, pinned: new Set<string>() }

describe('planCommit', () => {
  it('orders by score on first commit', () => {
    const next = planCommit(EMPTY_COMMITTED, [r('a', 0.1), r('b', 0.9)], opts)
    expect(next.order).toEqual(['b', 'a'])
  })

  it('ignores score changes below the hysteresis threshold (no jitter)', () => {
    const prev = planCommit(EMPTY_COMMITTED, [r('a', 0.5), r('b', 0.48)], opts)
    const next = planCommit(prev, [r('a', 0.47), r('b', 0.52)], opts)
    expect(next.order).toEqual(['a', 'b'])
  })

  it('moves an item when its score change exceeds the threshold', () => {
    const prev = planCommit(EMPTY_COMMITTED, [r('a', 0.5), r('b', 0.3)], opts)
    const next = planCommit(prev, [r('a', 0.5), r('b', 0.9)], opts)
    expect(next.order).toEqual(['b', 'a'])
  })

  it('keeps a pinned (hovered) item in its slot', () => {
    const prev = planCommit(EMPTY_COMMITTED, [r('a', 0.9), r('b', 0.5), r('c', 0.1)], opts)
    const next = planCommit(prev, [r('a', 0.1), r('b', 0.5), r('c', 0.9)], { ...opts, pinned: new Set(['b']) })
    expect(next.order).toEqual(['c', 'b', 'a'])
    const pinTop = planCommit(prev, [r('a', 0.1), r('b', 0.5), r('c', 0.9)], { ...opts, pinned: new Set(['a']) })
    expect(pinTop.order).toEqual(['a', 'c', 'b'])
  })

  it('inserts new items by score and drops removed ones', () => {
    const prev = planCommit(EMPTY_COMMITTED, [r('a', 0.9), r('b', 0.5)], opts)
    const next = planCommit(prev, [r('a', 0.9), r('n', 0.7)], opts)
    expect(next.order).toEqual(['a', 'n'])
  })

  it('does not mutate the previous commit', () => {
    const prev = planCommit(EMPTY_COMMITTED, [r('a', 0.9), r('b', 0.5)], opts)
    const order = [...prev.order]
    planCommit(prev, [r('a', 0.1), r('b', 0.9)], opts)
    expect(prev.order).toEqual(order)
  })
})

describe('countMoves', () => {
  it('counts items that moved up and items that are new', () => {
    expect(countMoves(['a', 'b', 'c'], ['c', 'a', 'n'])).toEqual({ movedUp: 1, added: 1 })
  })

  it('reports nothing for identical orders', () => {
    expect(countMoves(['a', 'b'], ['a', 'b'])).toEqual({ movedUp: 0, added: 0 })
  })
})
