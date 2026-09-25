/**
 * Headless checks of the Pokédex ranking on the real data (npm run eval:pokedex), using the same
 * semantic-state functions the worker runs:
 *  1. free-text search → share of the top 10 with the expected type
 *  2. multi-interest vs a single averaged centroid after clicking a water and a fire starter
 *  3. how the similarity weights change "similar to Pikachu"
 */
import { readFile } from 'node:fs/promises'
import { pipeline } from '@huggingface/transformers'
import {
  type AttentionState,
  EMPTY_ATTENTION,
  EMPTY_CENTROID,
  type FeatureVectors,
  type Id,
  type Vec,
  type Weights,
  centroidVector,
  collapseGroups,
  defaultScorer,
  dot,
  observe,
  rankForDisplay,
  recordInteraction,
  scoreAll,
  similarTo,
} from 'semantic-state/core'
import { decodeVectorFile } from 'semantic-state/worker'
import { parsePokedex } from '../src/pokedex/data.ts'
import { pokedexFeatures } from '../src/pokedex/features.ts'
import { DEFAULT_WEIGHTS, type Pokemon, type PokemonType } from '../src/pokedex/types.ts'
import { EMBEDDING_MODEL } from '../src/semantic/config.ts'

const pokedex = parsePokedex(JSON.parse(await readFile('public/pokedex/pokedex.json', 'utf8')))
const meta = JSON.parse(await readFile('public/pokedex/meta.json', 'utf8'))
const bin = await readFile('public/pokedex/vectors.bin')
const text = decodeVectorFile(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta)
const extra = pokedexFeatures(pokedex)
const features = new Map<Id, FeatureVectors>(pokedex.map((p) => [p.id, { ...extra.get(p.id), text: text.get(p.id)! }]))
const byId = new Map(pokedex.map((p) => [p.id, p]))
const familyOf = (id: Id) => byId.get(Number(id))?.familyId
const MULTI = { mode: 'multi' } as const
const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' })
const embed = async (q: string): Promise<Vec> => (await extractor(q, { pooling: 'mean', normalize: true })).data as Float32Array

const top = (attention: AttentionState, queryVec: Vec | null, n = 10, weights: Weights = DEFAULT_WEIGHTS): Pokemon[] => {
  const scored = scoreAll({ items: pokedex, idOf: (p) => p.id, features: (id) => features.get(id), queryVec, attention, interests: MULTI, weights, scorer: defaultScorer })
  return rankForDisplay(scored, { group: { kind: 'key', of: familyOf }, lanes: true, limit: n }).ranked.map((r) => byId.get(Number(r.id))!)
}
const click = (...ids: number[]) => ids.reduce((state, id) => recordInteraction(state, id, 'open', text.get(id), MULTI), EMPTY_ATTENTION)
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
  const results = top(EMPTY_ATTENTION, await embed(query))
  const share = typeShare(results, wanted)
  shares.push(share)
  out.push(`  "${query}" → ${wanted.join('/')} ${Math.round(share * 10)}/10 · ${names(results.slice(0, 5))}`)
}
out.push(`  mean type precision@10: ${(shares.reduce((a, b) => a + b, 0) / shares.length).toFixed(2)}`)

out.push('\n2. Click Squirtle then Charmander')
const multi = top(click(7, 4), null)
out.push(`  multi-interest: water ${typeShare(multi, ['water'])} · fire ${typeShare(multi, ['fire'])} · ${names(multi.slice(0, 6))}`)
const hybrid = (id: number) => {
  const f = features.get(id)!
  return new Float32Array([...f.text, ...f.type, ...f.stats])
}
const centroid = centroidVector(observe(observe(EMPTY_CENTROID, hybrid(7)), hybrid(4)))!
const single = collapseGroups(
  pokedex
    .filter((p) => p.id !== 7 && p.id !== 4)
    .map((p) => ({ id: p.id, score: dot(hybrid(p.id), centroid), confidence: 0, reason: { kind: 'interest' as const, becauseOf: null } }))
    .sort((a, b) => b.score - a.score),
  familyOf,
)
  .ranked.slice(0, 10)
  .map((r) => byId.get(Number(r.id))!)
out.push(`  single centroid: water ${typeShare(single, ['water'])} · fire ${typeShare(single, ['fire'])} · ${names(single.slice(0, 6))}`)

out.push('\n3. Similar to Pikachu, by weight setting')
const settings: [string, Weights][] = [
  ['description only', { text: 1, type: 0, stats: 0 }],
  ['type only', { text: 0, type: 1, stats: 0 }],
  ['stats only', { text: 0, type: 0, stats: 1 }],
  ['default', DEFAULT_WEIGHTS],
]
for (const [label, weights] of settings) {
  const similar = similarTo(25, { items: pokedex, idOf: (p) => p.id, features: (id) => features.get(id), weights, groupOf: familyOf }, 6)
  out.push(`  ${label.padEnd(16)} ${names(similar.map((r) => byId.get(Number(r.id))!))}`)
}

process.stdout.write(`${out.join('\n')}\n`)
