import { dot, similarity } from 'semantic-state/core'
import { describe, expect, it } from 'vitest'
import { pokedexFeatures, statProfiles, typeVector } from './features.ts'
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
    expect(dot(v, v)).toBeCloseTo(1)
  })
})

describe('statProfiles', () => {
  it('captures the shape of a stat spread relative to the dex, not raw totals', () => {
    const [fast, alsoFast, slow] = statProfiles([mon(1, ['fire'], 150, 20), mon(2, ['fire'], 140, 25), mon(3, ['fire'], 10, 140)])
    expect(dot(fast, alsoFast)).toBeGreaterThan(dot(fast, slow))
  })

  it('stays finite when every Pokémon has identical stats', () => {
    const profiles = statProfiles([mon(1, ['fire'], 50), mon(2, ['fire'], 50)])
    expect(Array.from(profiles[0]).every(Number.isFinite)).toBe(true)
  })
})

describe('pokedexFeatures', () => {
  it('gives each Pokémon type and stats vectors that the library blends by weight', () => {
    const features = pokedexFeatures([mon(1, ['fire'], 90), mon(2, ['water'], 90), mon(3, ['fire'], 90)])
    expect(similarity(features.get(1)!, features.get(3)!, { type: 1 })).toBeCloseTo(1)
    expect(similarity(features.get(1)!, features.get(2)!, { type: 1 })).toBeCloseTo(0)
    expect(Object.keys(features.get(1)!).sort()).toEqual(['stats', 'type'])
  })
})
