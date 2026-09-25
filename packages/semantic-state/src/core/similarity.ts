import type { FeatureVectors, Weights } from './types.ts'
import { dot } from './vector.ts'

/**
 * Weighted blend of per-feature cosine similarities (vectors are unit length).
 * Features missing on either side, or weighted 0, don't count.
 */
export function similarity(a: FeatureVectors, b: FeatureVectors, weights: Weights): number {
  let total = 0
  let sum = 0
  for (const [name, weight] of Object.entries(weights)) {
    const va = a[name]
    const vb = b[name]
    if (weight <= 0 || !va || !vb) continue
    total += weight
    sum += weight * dot(va, vb)
  }
  return total === 0 ? 0 : sum / total
}
