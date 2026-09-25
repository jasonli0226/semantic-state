import { describe, expect, it } from 'vitest'
import { precisionAtK } from './metrics.ts'

describe('precisionAtK', () => {
  it('is the share of the top k that is relevant', () => {
    expect(precisionAtK(['a', 'x', 'b', 'y', 'z', 'c'], new Set(['a', 'b', 'c']), 5)).toBe(0.4)
  })

  it('divides by k even when the list is shorter', () => {
    expect(precisionAtK(['a'], new Set(['a']), 5)).toBe(0.2)
  })

  it('returns 0 for k = 0', () => {
    expect(precisionAtK(['a'], new Set(['a']), 0)).toBe(0)
  })
})
