/**
 * Headless checks of the Pokédex ranking on the real data (npm run eval:pokedex):
 *  1. free-text search → share of the top 10 with the expected type
 *  2. multi-interest vs a single averaged centroid after clicking a water and a fire starter
 *  3. how the similarity weights change "similar to Pikachu"
 */
import { readFile } from 'node:fs/promises'
import { pipeline } from '@huggingface/transformers'
import { EMPTY_CENTROID, centroidVector, observe } from '../src/core/centroid.ts'
import type { Vec } from '../src/core/types.ts'
import { dot } from '../src/core/vector.ts'
import { decodeVectors, parsePokedex } from '../src/pokedex/data.ts'
import { buildFeatures } from '../src/pokedex/features.ts'
import { type Interest, addInterest, collapseFamilies, rankForDisplay, similarTo } from '../src/pokedex/rank.ts'
import { DEFAULT_WEIGHTS, type PokemonType } from '../src/pokedex/types.ts'
import { EMBEDDING_MODEL } from '../src/semantic/config.ts'

const pokedex = parsePokedex(JSON.parse(await readFile('public/pokedex/pokedex.json', 'utf8')))
const meta = JSON.parse(await readFile('public/pokedex/meta.json', 'utf8'))
const bin = await readFile('public/pokedex/vectors.bin')
const text = decodeVectors(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta.count, meta.dims)
const features = buildFeatures(pokedex, text)
const byId = new Map(pokedex.map((p) => [p.id, p]))
const familyOf = new Map(pokedex.map((p) => [p.id, p.familyId]))
const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' })
const embed = async (q: string): Promise<Vec> => (await extractor(q, { pooling: 'mean', normalize: true })).data as Float32Array

const top = (interests: readonly Interest[], queryVec: Vec | null, n = 10, weights = DEFAULT_WEIGHTS) =>
  rankForDisplay(pokedex, { features, interests, queryVec, weights }, n).ranked.map((r) => byId.get(r.id)!)
const names = (list: readonly { name: string }[]) => list.map((p) => p.name).join(', ')
const typeShare = (list: readonly { types: readonly PokemonType[] }[], wanted: readonly PokemonType[]) =>
  list.filter((p) => p.types.some((t) => wanted.includes(t))).length / list.length
const out: string[] = []

out.push('1. Free-text search (top 10, one per family)')
const queries: [string, PokemonType[]][] = [
  ['cute electric mouse', ['electric']],
  ['fire breathing dragon', ['fire', 'dragon']],
  ['ghost that haunts old houses', ['ghost']],
  ['lives in the deep ocean', ['water']],
  ['giant snake made of rock', ['rock', 'ground']],
  ['psychic cat', ['psychic']],
  ['flower that heals people', ['grass', 'fairy']],
  ['frozen bird', ['ice', 'flying']],
]
const shares: number[] = []
for (const [query, wanted] of queries) {
  const results = top([], await embed(query))
  const share = typeShare(results, wanted)
  shares.push(share)
  out.push(`  "${query}" → ${wanted.join('/')} ${Math.round(share * 10)}/10 · ${names(results.slice(0, 5))}`)
}
out.push(`  mean type precision@10: ${(shares.reduce((a, b) => a + b, 0) / shares.length).toFixed(2)}`)

out.push('\n2. Click Squirtle then Charmander')
const interests = addInterest(addInterest([], 7), 4)
const multi = top(interests, null)
out.push(`  multi-interest: water ${typeShare(multi, ['water'])} · fire ${typeShare(multi, ['fire'])} · ${names(multi.slice(0, 6))}`)
const hybrid = (id: number) => {
  const f = features.get(id)!
  return new Float32Array([...f.text, ...f.type, ...f.stats])
}
const centroid = centroidVector(observe(observe(EMPTY_CENTROID, hybrid(7)), hybrid(4)))!
const single = collapseFamilies(
  pokedex
    .filter((p) => p.id !== 7 && p.id !== 4)
    .map((p) => ({ id: p.id, score: dot(hybrid(p.id), centroid), confidence: 0, reason: { kind: 'interest' as const, becauseOf: null } }))
    .sort((a, b) => b.score - a.score),
  familyOf,
).ranked.slice(0, 10).map((r) => byId.get(r.id)!)
out.push(`  single centroid: water ${typeShare(single, ['water'])} · fire ${typeShare(single, ['fire'])} · ${names(single.slice(0, 6))}`)

out.push('\n3. Similar to Pikachu, by weight setting')
for (const [label, w] of [['description only', { text: 1, type: 0, stats: 0 }], ['type only', { text: 0, type: 1, stats: 0 }], ['stats only', { text: 0, type: 0, stats: 1 }], ['default', DEFAULT_WEIGHTS]] as const) {
  out.push(`  ${label.padEnd(16)} ${names(similarTo(25, pokedex, features, w, 6).map((r) => byId.get(r.id)!))}`)
}

process.stdout.write(`${out.join('\n')}\n`)
