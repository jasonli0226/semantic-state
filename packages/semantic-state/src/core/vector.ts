import type { Vec } from './types.ts'

export function dot(a: Vec, b: Vec): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

export function scale(a: Vec, k: number): Vec {
  const out = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i] * k
  return out
}

/** Returns a + b * k as a new vector. */
export function addScaled(a: Vec, b: Vec, k: number): Vec {
  const out = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i] * k
  return out
}

export function normalize(a: Vec): Vec {
  const length = Math.sqrt(dot(a, a))
  return length === 0 ? new Float32Array(a) : scale(a, 1 / length)
}
