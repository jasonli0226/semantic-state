export const POKEMON_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const

export type PokemonType = (typeof POKEMON_TYPES)[number]

export const STAT_KEYS = ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed'] as const

export type StatKey = (typeof STAT_KEYS)[number]

export interface Pokemon {
  readonly id: number
  readonly name: string
  readonly genus: string
  readonly types: readonly PokemonType[]
  readonly stats: Readonly<Record<StatKey, number>>
  readonly generation: number
  readonly color: string
  readonly habitat: string | null
  /** Evolution chain id: Pokémon in one family share it. */
  readonly familyId: number
  readonly legendary: boolean
  readonly mythical: boolean
  readonly flavor: string
}

/** Relative weight of each similarity signal. Exposed as sliders in the UI. */
export interface SimilarityWeights {
  readonly text: number
  readonly type: number
  readonly stats: number
}

export const DEFAULT_WEIGHTS: SimilarityWeights = { text: 1, type: 1, stats: 0.5 }
