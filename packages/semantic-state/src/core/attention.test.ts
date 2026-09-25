import { describe, expect, it } from 'vitest'
import { EMPTY_ATTENTION, forgetInteraction, recordInteraction } from './attention.ts'

const v = (...xs: number[]) => new Float32Array(xs)

describe('attention', () => {
  it('centroid mode: observes the vector with per-kind strength and tracks interacted ids', () => {
    const config = { mode: 'centroid', decay: 0.5, strength: { open: 1, done: 2 } } as const
    const a = recordInteraction(EMPTY_ATTENTION, 'x', 'done', v(1, 0), config)
    expect(a.centroid.weight).toBe(2)
    expect(a.interacted.has('x')).toBe(true)
    expect(a.interests).toEqual([])
  })

  it('centroid mode: still records the id when the vector is not ready', () => {
    const a = recordInteraction(EMPTY_ATTENTION, 'x', 'open', undefined, { mode: 'centroid', decay: 0.7 })
    expect(a.centroid.weight).toBe(0)
    expect(a.interacted.has('x')).toBe(true)
  })

  it('multi mode: adds an interest', () => {
    const a = recordInteraction(EMPTY_ATTENTION, 7, 'open', v(1), { mode: 'multi' })
    expect(a.interests).toEqual([{ id: 7, weight: 1 }])
  })

  it('forget removes an interest and its interacted flag', () => {
    const a = recordInteraction(EMPTY_ATTENTION, 7, 'open', v(1), { mode: 'multi' })
    const b = forgetInteraction(a, 7)
    expect(b.interests).toEqual([])
    expect(b.interacted.has(7)).toBe(false)
  })

  it('never mutates the previous state', () => {
    const a = recordInteraction(EMPTY_ATTENTION, 7, 'open', v(1), { mode: 'multi' })
    recordInteraction(a, 8, 'open', v(1), { mode: 'multi' })
    expect(a.interests).toHaveLength(1)
    expect(EMPTY_ATTENTION.interacted.size).toBe(0)
  })
})
