import { z } from 'zod'
import type { Vec } from '../core/types.ts'
import { POKEMON_TYPES, type Pokemon, STAT_KEYS } from './types.ts'

const stat = z.number().int().min(1).max(255)

const PokemonSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  genus: z.string(),
  types: z.array(z.enum(POKEMON_TYPES)).min(1).max(2),
  stats: z.object(Object.fromEntries(STAT_KEYS.map((key) => [key, stat])) as Record<(typeof STAT_KEYS)[number], typeof stat>),
  generation: z.number().int().positive(),
  color: z.string(),
  habitat: z.string().nullable(),
  familyId: z.number().int().positive(),
  legendary: z.boolean(),
  mythical: z.boolean(),
  flavor: z.string(),
})

/** Validates pokedex.json (fetched at runtime, so treated as untrusted input). */
export function parsePokedex(input: unknown): Pokemon[] {
  const result = z.array(PokemonSchema).safeParse(input)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n')
    throw new Error(`Invalid pokedex.json:\n${issues}`)
  }
  const ids = new Set<number>()
  for (const { id } of result.data) {
    if (ids.has(id)) throw new Error(`Invalid pokedex.json: duplicate id ${id}`)
    ids.add(id)
  }
  return result.data
}

/** vectors.bin: `count` Float32 vectors of `dims` values, in pokedex.json order. */
export function decodeVectors(buffer: ArrayBuffer, count: number, dims: number): Vec[] {
  const expected = count * dims * Float32Array.BYTES_PER_ELEMENT
  if (buffer.byteLength !== expected) {
    throw new Error(`Invalid vectors.bin: expected ${expected} bytes, got ${buffer.byteLength}`)
  }
  const all = new Float32Array(buffer)
  return Array.from({ length: count }, (_, i) => all.slice(i * dims, (i + 1) * dims))
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** What gets embedded: the Pokémon described in plain words, so free-text queries can match it. */
export function embeddingTextFor(p: Pokemon): string {
  const types = `${capitalize(p.types.join(' and '))} type.`
  const place = p.habitat ? `${capitalize(p.color)}, lives in ${p.habitat}.` : `${capitalize(p.color)}.`
  return `${p.name}, the ${p.genus}. ${types} ${place} ${p.flavor}`.trim()
}
