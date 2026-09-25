import { type FeatureVectors, type Vec, normalize } from 'semantic-state/core'
import { POKEMON_TYPES, type Pokemon, type PokemonType, STAT_KEYS } from './types.ts'

/**
 * Structured features next to the text embedding. Text captures "vibe" (ocean, ghostly, sleepy) but is
 * bad at numbers, so types and stats get their own vectors; semantic-state blends them by weight.
 */

export function typeVector(types: readonly PokemonType[]): Vec {
  return normalize(new Float32Array(POKEMON_TYPES.map((t) => (types.includes(t) ? 1 : 0))))
}

/** Per-stat z-scores against the whole dex, normalized: the *shape* of a spread (fast glass cannon vs tank). */
export function statProfiles(pokedex: readonly Pokemon[]): Vec[] {
  const n = Math.max(1, pokedex.length)
  const mean = STAT_KEYS.map((key) => pokedex.reduce((sum, p) => sum + p.stats[key], 0) / n)
  const std = STAT_KEYS.map((key, i) => Math.sqrt(pokedex.reduce((sum, p) => sum + (p.stats[key] - mean[i]) ** 2, 0) / n) || 1)
  return pokedex.map((p) => normalize(new Float32Array(STAT_KEYS.map((key, i) => (p.stats[key] - mean[i]) / std[i]))))
}

/** `features` for defineSemanticWorker: receives every Pokémon so stats can be normalized across the dex. */
export function pokedexFeatures(pokedex: readonly Pokemon[]): Map<number, FeatureVectors> {
  const profiles = statProfiles(pokedex)
  return new Map(pokedex.map((p, i) => [p.id, { type: typeVector(p.types), stats: profiles[i] }]))
}
