import { describe, expect, it } from 'vitest'
import { EMPTY_CENTROID, centroidVector, observe } from './centroid.ts'
import { dot } from './vector.ts'

const v = (...xs: number[]) => new Float32Array(xs)

describe('centroid', () => {
  it('starts empty', () => {
    expect(centroidVector(EMPTY_CENTROID)).toBeNull()
    expect(EMPTY_CENTROID.weight).toBe(0)
  })

  it('first observation points at the observed vector', () => {
    const c = observe(EMPTY_CENTROID, v(1, 0), 1)
    expect(Array.from(centroidVector(c)!)).toEqual([1, 0])
    expect(c.weight).toBe(1)
  })

  it('decays older observations so the centroid drifts toward recent focus', () => {
    const a = v(1, 0)
    const b = v(0, 1)
    let c = observe(EMPTY_CENTROID, a, 1, 0.5)
    c = observe(c, a, 1, 0.5)
    const beforeSwitch = centroidVector(c)!
    expect(dot(beforeSwitch, a)).toBeGreaterThan(dot(beforeSwitch, b))
    c = observe(c, b, 1, 0.5)
    c = observe(c, b, 1, 0.5)
    c = observe(c, b, 1, 0.5)
    const afterSwitch = centroidVector(c)!
    expect(dot(afterSwitch, b)).toBeGreaterThan(dot(afterSwitch, a))
  })

  it('does not mutate the previous centroid', () => {
    const c1 = observe(EMPTY_CENTROID, v(1, 0), 1)
    const snapshot = Array.from(c1.sum!)
    observe(c1, v(0, 1), 1)
    expect(Array.from(c1.sum!)).toEqual(snapshot)
    expect(c1.weight).toBe(1)
  })
})
