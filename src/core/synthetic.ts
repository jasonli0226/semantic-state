import { HOUR } from './time.ts'
import type { Item, Vec } from './types.ts'
import { addScaled, dot, normalize } from 'semantic-state/core'

/**
 * Filler items for the 1k / 10k scale test. Each one is a real item's embedding pushed in a random
 * orthogonal direction, so it is plausible but never an exact duplicate (similarity to base = 1/√(1+k²)).
 */
const NOISE = 1.2
const MIN_AGE_HOURS = 48
const AGE_SPREAD_HOURS = 500

export interface Synthetic {
  readonly item: Item
  readonly vector: Vec
}

export interface SyntheticOptions {
  readonly startIndex: number
  readonly now: number
  readonly seed: number
}

/** mulberry32: tiny seeded PRNG so scale runs are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomDirection(dims: number, random: () => number): Vec {
  // Box–Muller gives an isotropic Gaussian, so the direction is uniform on the sphere.
  const out = new Float32Array(dims)
  for (let i = 0; i < dims; i++) {
    out[i] = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
  }
  return out
}

export function makeSynthetic(bases: readonly Synthetic[], count: number, opts: SyntheticOptions): Synthetic[] {
  if (bases.length === 0) return []
  const random = rng(opts.seed)

  return Array.from({ length: count }, (_, i) => {
    const base = bases[Math.floor(random() * bases.length)]
    const r = randomDirection(base.vector.length, random)
    const orthogonal = normalize(addScaled(r, base.vector, -dot(r, base.vector)))
    const vector = normalize(addScaled(base.vector, orthogonal, NOISE))
    const n = opts.startIndex + i
    const item: Item = {
      id: `syn-${n}`,
      source: base.item.source,
      sender: 'synthetic',
      title: `Synthetic #${n} (≈ ${base.item.title})`,
      body: '',
      labels: [],
      dueAt: null,
      createdAt: opts.now - (MIN_AGE_HOURS + random() * AGE_SPREAD_HOURS) * HOUR,
    }
    return { item, vector }
  })
}
