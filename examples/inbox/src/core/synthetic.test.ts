import { describe, expect, it } from 'vitest'
import { makeSynthetic } from './synthetic.ts'
import type { Item, Vec } from './types.ts'
import { dot } from 'semantic-state/core'

const HOUR = 3_600_000
const NOW = 1_000 * HOUR
const base: Item = { id: 'b', source: 'jira', sender: 's', title: 'Base', body: '', labels: [], dueAt: null, createdAt: NOW }
const baseVec = new Float32Array([1, 0, 0, 0])
const bases = [{ item: base, vector: baseVec as Vec }]

describe('makeSynthetic', () => {
  it('creates the requested number of items with unit vectors near their base', () => {
    const out = makeSynthetic(bases, 50, { startIndex: 0, now: NOW, seed: 1 })
    expect(out).toHaveLength(50)
    for (const { vector } of out) {
      expect(dot(vector, vector)).toBeCloseTo(1, 5)
      expect(dot(vector, baseVec)).toBeGreaterThan(0.3)
    }
  })

  it('is deterministic for a seed and continues ids from startIndex', () => {
    const a = makeSynthetic(bases, 3, { startIndex: 10, now: NOW, seed: 7 })
    const b = makeSynthetic(bases, 3, { startIndex: 10, now: NOW, seed: 7 })
    expect(a.map((s) => s.item.id)).toEqual(['syn-10', 'syn-11', 'syn-12'])
    expect(Array.from(a[0].vector)).toEqual(Array.from(b[0].vector))
  })

  it('creates old, undated, unlabeled items so they never outrank the scenario on deadlines', () => {
    const [s] = makeSynthetic(bases, 1, { startIndex: 0, now: NOW, seed: 3 })
    expect(s.item.dueAt).toBeNull()
    expect(s.item.labels).toEqual([])
    expect(s.item.createdAt).toBeLessThan(NOW - 24 * HOUR)
  })

  it('returns nothing without bases', () => {
    expect(makeSynthetic([], 5, { startIndex: 0, now: NOW, seed: 1 })).toEqual([])
  })
})
