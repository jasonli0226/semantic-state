/**
 * Headless checks of the memory graph on the real data (npm run eval:graph), using the same semantic-state
 * functions the worker runs:
 *  1. neighbour quality — is an expected article among the top-K neighbours of a source article?
 *  2. what the E2E search query finds
 *  3. baseline timings, for comparing with runtime loading later
 */
import { readFile } from 'node:fs/promises'
import { pipeline } from '@huggingface/transformers'
import { type FeatureVectors, type Id, dot, similarTo } from 'semantic-state/core'
import { decodeVectorFile } from 'semantic-state/worker'
import { EMBEDDING_MODEL, K } from '../src/config.ts'
import { parseArticles } from '../src/data.ts'
import { wikiFeatures } from '../src/features.ts'
import { DEFAULT_WEIGHTS } from '../src/types.ts'

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
const articles = parseArticles(JSON.parse(await readFile('public/wiki/articles.json', 'utf8')))
const meta = JSON.parse(await readFile('public/wiki/meta.json', 'utf8'))
const bin = await readFile('public/wiki/vectors.bin')
const text = decodeVectorFile(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta)
const loadMs = performance.now() - started

const extra = wikiFeatures(articles)
const features = new Map<Id, FeatureVectors>(articles.map((a) => [a.id, { ...extra.get(a.id), text: text.get(a.id)! }]))
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

if (hits < MIN_HITS) process.exitCode = 1
