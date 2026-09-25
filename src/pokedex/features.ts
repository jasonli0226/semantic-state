import type { Vec } from '../core/types.ts'
import { dot, normalize } from '../core/vector.ts'
import { POKEMON_TYPES, type Pokemon, type PokemonType, STAT_KEYS, type SimilarityWeights } from './types.ts'

/**
 * Hybrid similarity. Text embeddings capture "vibe" (ocean, ghostly, sleepy) but are bad at numbers,
 * so types and stats get their own structured vectors, blended by adjustable weights.
 */
export interface Features {
  readonly text: Vec
  readonly type: Vec
  readonly stats: Vec
}

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

export function buildFeatures(pokedex: readonly Pokemon[], textVectors: readonly Vec[]): ReadonlyMap<number, Features> {
  const profiles = statProfiles(pokedex)
  return new Map(pokedex.map((p, i) => [p.id, { text: textVectors[i], type: typeVector(p.types), stats: profiles[i] }]))
}

export function similarity(a: Features, b: Features, w: SimilarityWeights): number {
  const total = w.text + w.type + w.stats
  if (total <= 0) return 0
  return (w.text * dot(a.text, b.text) + w.type * dot(a.type, b.type) + w.stats * dot(a.stats, b.stats)) / total
}
