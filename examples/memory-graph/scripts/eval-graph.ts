/**
 * Headless checks of the memory graph on the real data (npm run eval:graph), using the same semantic-state
 * functions the worker runs:
 *  1. neighbour quality — is an expected article among the top-K neighbours of a source article?
 *  2. what the E2E search query finds
 *  3. baseline timings, for comparing with runtime loading later
 */
import { readFile } from 'node:fs/promises'
import { pipeline } from '@huggingface/transformers'
import { type Id, dot, similarTo } from 'semantic-state/core'
import { EMBEDDING_MODEL, K } from '../src/config.ts'
import { DEFAULT_WEIGHTS } from '../src/types.ts'
import { loadPrebuilt } from './load-prebuilt.ts'

const PAIRS: readonly (readonly [string, readonly string[]])[] = [
  ['Moon', ['Earth', 'Sun', 'Solar System']],
  ['Photosynthesis', ['Plant']],
  ['Volcano', ['Plate tectonics', 'Earthquake']],
  ['Coffee', ['Tea']],
  ['Bread', ['Wheat']],
  ['Vaccine', ['Smallpox']],
  ['DNA', ['Gene']],
  ['Charles Darwin', ['Evolution']],
  ['Albert Einstein', ['Theory of relativity', 'Physics']],
  ['Electricity', ['Magnetism', 'Electromagnetism']],
]
const MIN_HITS = 8
/** Must match the query in e2e/memory-graph.spec.ts. */
const E2E_QUERY = 'playing the guitar in a band'

const started = performance.now()
const { articles, text, features } = await loadPrebuilt()
const loadMs = performance.now() - started

const byTitle = new Map(articles.map((a) => [a.title, a]))
const byId = new Map(articles.map((a) => [a.id, a]))
const input = { items: articles, idOf: (a: (typeof articles)[number]) => a.id, features: (id: Id) => features.get(id), weights: DEFAULT_WEIGHTS }

console.log(`1. Top-${K} neighbours`)
const neighbourMs: number[] = []
const hits = PAIRS.filter(([source, expected]) => {
  const article = byTitle.get(source)
  if (!article) throw new Error(`"${source}" is not in articles.json`)
  const t0 = performance.now()
  const top = similarTo(article.id, input, K).map((s) => byId.get(Number(s.id))?.title ?? String(s.id))
  neighbourMs.push(performance.now() - t0)
  const hit = top.some((t) => expected.includes(t))
  console.log(`  ${hit ? '✔' : '✘'} ${source} → ${top.join(', ')}`)
  return hit
}).length
console.log(`  ${hits}/${PAIRS.length} sources have an expected neighbour (need ${MIN_HITS})`)

console.log(`\n2. Search "${E2E_QUERY}"`)
const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' })
const queryVec = (await extractor(E2E_QUERY, { pooling: 'mean', normalize: true })).data as Float32Array
const ranked = articles.map((a) => [a.title, dot(queryVec, text.get(a.id)!)] as const).sort((a, b) => b[1] - a[1]).slice(0, 3)
console.log(ranked.map(([title, sim]) => `  ${title} (${sim.toFixed(3)})`).join('\n'))

const median = [...neighbourMs].sort((a, b) => a - b)[Math.floor(neighbourMs.length / 2)]
console.log(`\n3. Baseline: load + decode ${loadMs.toFixed(0)} ms · neighbours median ${median.toFixed(2)} ms over ${articles.length} articles`)

console.log('\n4. Map quality')
const layout = JSON.parse(await readFile('public/wiki/layout.json', 'utf8')) as { ids: number[]; x: number[]; y: number[] }
const pos = new Map(layout.ids.map((id, i) => [id, { x: layout.x[i], y: layout.y[i] }]))
const dist = (a: number, b: number) => Math.hypot(pos.get(a)!.x - pos.get(b)!.x, pos.get(a)!.y - pos.get(b)!.y)
let seed = 42
const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
const ids = articles.map((a) => a.id)
const randomPairs = Array.from({ length: 1000 }, () => dist(ids[Math.floor(random() * ids.length)], ids[Math.floor(random() * ids.length)])).sort((a, b) => a - b)
const medianRandom = randomPairs[500]
const neighbourLengths = articles.flatMap((a) => similarTo(a.id, input, K).map((s) => dist(a.id, Number(s.id))))
const short = neighbourLengths.filter((d) => d < medianRandom).length / neighbourLengths.length
console.log(`  ${(short * 100).toFixed(1)} % of neighbour edges are shorter than the median random pair (${medianRandom.toFixed(0)}); need 90 %`)

if (hits < MIN_HITS || short < 0.9) process.exitCode = 1
