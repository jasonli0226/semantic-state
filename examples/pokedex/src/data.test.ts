import { describe, expect, it } from 'vitest'
import { embeddingTextFor, parsePokedex } from './data.ts'
import type { Pokemon } from './types.ts'

const pikachu = {
  id: 25,
  name: 'Pikachu',
  genus: 'Mouse Pokémon',
  types: ['electric'],
  stats: { hp: 35, attack: 55, defense: 40, spAttack: 50, spDefense: 50, speed: 90 },
  generation: 1,
  color: 'yellow',
  habitat: 'forest',
  familyId: 10,
  legendary: false,
  mythical: false,
  flavor: 'It stores electricity in its cheeks.',
} satisfies Pokemon

describe('parsePokedex', () => {
  it('accepts a valid entry', () => {
    expect(parsePokedex([pikachu])[0].name).toBe('Pikachu')
  })

  it('rejects an unknown type with the path in the message', () => {
    expect(() => parsePokedex([{ ...pikachu, types: ['plasma'] }])).toThrow(/pokedex\.json.*0\.types\.0/s)
  })

  it('rejects duplicate ids', () => {
    expect(() => parsePokedex([pikachu, pikachu])).toThrow(/duplicate id 25/)
  })

  it('rejects entries with no types or more than two', () => {
    expect(() => parsePokedex([{ ...pikachu, types: [] }])).toThrow()
    expect(() => parsePokedex([{ ...pikachu, types: ['fire', 'water', 'grass'] }])).toThrow()
  })
})

describe('embeddingTextFor', () => {
  it('describes the Pokémon in words, including types, color and habitat', () => {
    expect(embeddingTextFor(pikachu)).toBe(
      'Pikachu, the Mouse Pokémon. Electric type. Yellow, lives in forest. It stores electricity in its cheeks.',
    )
  })

  it('omits the habitat when unknown and joins dual types', () => {
    const text = embeddingTextFor({ ...pikachu, types: ['water', 'ground'], habitat: null })
    expect(text).toContain('Water and ground type. Yellow.')
  })
})
