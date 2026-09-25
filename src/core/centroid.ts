import type { Vec } from './types.ts'
import { addScaled, normalize, scale } from './vector.ts'

/**
 * Attention centroid: exponentially decayed sum of the embeddings the user interacted with.
 * This is the v1 "memory reducer": (beliefs, observation) => beliefs, deterministic, no LLM.
 */
export interface Centroid {
  readonly sum: Vec | null
  readonly weight: number
}

export const EMPTY_CENTROID: Centroid = { sum: null, weight: 0 }

/** Per-interaction decay: after ~4 interactions on a new topic the centroid has moved over. */
export const DEFAULT_DECAY = 0.7

export function observe(centroid: Centroid, vec: Vec, strength = 1, decay = DEFAULT_DECAY): Centroid {
  const sum = centroid.sum ? addScaled(scale(centroid.sum, decay), vec, strength) : scale(vec, strength)
  return { sum, weight: centroid.weight * decay + strength }
}

export function centroidVector(centroid: Centroid): Vec | null {
  return centroid.sum ? normalize(centroid.sum) : null
}
