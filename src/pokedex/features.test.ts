import { describe, expect, it } from 'vitest'
import { buildFeatures, similarity, statProfiles, typeVector } from './features.ts'
import type { Pokemon } from './types.ts'

const mon = (id: number, types: Pokemon['types'], speed: number, attack = 50): Pokemon => ({
  id,
  name: `m${id}`,
  genus: '',
  types,
  stats: { hp: 50, attack, defense: 50, spAttack: 50, spDefense: 50, speed },
  generation: 1,
  color: 'red',
  habitat: null,
  familyId: id,
  legendary: false,
  mythical: false,
  flavor: '',
})

describe('typeVector', () => {
  it('is a unit vector over the 18 types', () => {
    const v = typeVector(['water', 'ground'])
    expect(v).toHaveLength(18)
    expect(v.reduce((s, x) => s + x * x, 0)).toBeCloseTo(1)
  })
})

describe('statProfiles', () => {
  it('captures the shape of a stat spread relative to the dex, not raw totals', () => {
    const [fast, alsoFast, slow] = statProfiles([mon(1, ['fire'], 150, 20), mon(2, ['fire'], 140, 25), mon(3, ['fire'], 10, 140)])
    const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0)
    expect(dot(fast, alsoFast)).toBeGreaterThan(dot(fast, slow))
  })

  it('stays finite when every Pokémon has identical stats', () => {
    const profiles = statProfiles([mon(1, ['fire'], 50), mon(2, ['fire'], 50)])
    expect(Array.from(profiles[0]).every(Number.isFinite)).toBe(true)
  })
})

describe('similarity', () => {
  const text = [new Float32Array([1, 0]), new Float32Array([1, 0]), new Float32Array([0, 1])]
  const features = buildFeatures([mon(1, ['fire'], 90), mon(2, ['water'], 90), mon(3, ['fire'], 90)], text)

  it('blends text, type and stats by weight', () => {
    const textOnly = { text: 1, type: 0, stats: 0 }
    const typeOnly = { text: 0, type: 1, stats: 0 }
    expect(similarity(features.get(1)!, features.get(2)!, textOnly)).toBeCloseTo(1)
    expect(similarity(features.get(1)!, features.get(2)!, typeOnly)).toBeCloseTo(0)
    expect(similarity(features.get(1)!, features.get(3)!, typeOnly)).toBeCloseTo(1)
  })

  it('returns 0 when every weight is 0', () => {
    expect(similarity(features.get(1)!, features.get(2)!, { text: 0, type: 0, stats: 0 })).toBe(0)
  })
})
