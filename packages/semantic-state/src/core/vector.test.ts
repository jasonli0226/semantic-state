import { describe, expect, it } from 'vitest'
import { addScaled, dot, normalize, scale } from './vector.ts'

const v = (...xs: number[]) => new Float32Array(xs)

describe('vector', () => {
  it('computes dot product', () => {
    expect(dot(v(1, 2, 3), v(4, 5, 6))).toBe(32)
  })

  it('normalizes to unit length without mutating input', () => {
    const input = v(3, 4)
    const out = normalize(input)
    expect(Array.from(out)).toEqual([0.6000000238418579, 0.800000011920929])
    expect(Array.from(input)).toEqual([3, 4])
  })

  it('returns a zero copy when normalizing a zero vector', () => {
    const input = v(0, 0)
    const out = normalize(input)
    expect(Array.from(out)).toEqual([0, 0])
    expect(out).not.toBe(input)
  })

  it('scales and adds into new vectors', () => {
    const a = v(1, 1)
    expect(Array.from(scale(a, 2))).toEqual([2, 2])
    expect(Array.from(addScaled(a, v(1, 0), 3))).toEqual([4, 1])
    expect(Array.from(a)).toEqual([1, 1])
  })
})
