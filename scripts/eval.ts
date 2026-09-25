/**
 * Headless run of the demo scenario with real embeddings (Node, no browser).
 * Prints precision@5 of the rules ranking vs the semantic ranking after every step.
 *   npm run eval            summary table
 *   npm run eval -- --top   also print each panel's top 5
 */
import { pipeline } from '@huggingface/transformers'
import { SCENARIO } from '../src/app/scenario.ts'
import { EMPTY_CENTROID, observe, type Centroid } from '../src/core/centroid.ts'
import { collapseDuplicates, groupDuplicates } from '../src/core/dedupe.ts'
import { precisionAtK } from '../src/core/metrics.ts'
import { rankItems } from '../src/core/rank.ts'
import { rankByRules } from '../src/core/rules.ts'
import type { Item, Phase, Vec } from '../src/core/types.ts'
import { dot } from '../src/core/vector.ts'
import { DEMO_NOW, embeddingText, groundTruth, initialItems } from '../src/data/dataset.ts'
import { ATTENTION_QUERY, EMBEDDING_MODEL } from '../src/semantic/config.ts'

const showTop = process.argv.includes('--top')
const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' })

async function embed(texts: readonly string[]): Promise<Vec[]> {
  const out = await extractor([...texts], { pooling: 'mean', normalize: true })
  const [n, dims] = out.dims
  const data = out.data as Float32Array
  return Array.from({ length: n }, (_, i) => data.slice(i * dims, (i + 1) * dims))
}

const vectors = new Map<string, Vec>()
async function addItems(items: readonly Item[]) {
  const vecs = await embed(items.map(embeddingText))
  items.forEach((item, i) => vectors.set(item.id, vecs[i]))
}

const [queryVec] = await embed([ATTENTION_QUERY])
let items: readonly Item[] = initialItems
let centroid: Centroid = EMPTY_CENTROID
let phase: Phase = 'payments'
let seen: ReadonlySet<string> = new Set()
await addItems(items)

const title = (id: string) => items.find((i) => i.id === id)?.title ?? id
const rows: string[] = []

for (const step of SCENARIO) {
  for (const action of step.actions) {
    if (action.kind === 'reset') {
      items = initialItems
      centroid = EMPTY_CENTROID
      seen = new Set()
      phase = 'payments'
    } else if (action.kind === 'open') {
      centroid = observe(centroid, vectors.get(action.id)!)
      seen = new Set([...seen, action.id])
    } else if (action.kind === 'arrive') {
      await addItems([action.item])
      items = [action.item, ...items]
    } else {
      phase = action.phase
    }
  }

  const rules = rankByRules(items, DEMO_NOW).map((r) => r.id)
  const ranked = rankItems(items, { getVector: (id) => vectors.get(id), queryVec, centroid, now: DEMO_NOW, seen })
  const order = ranked.map((r) => r.id)
  const semantic = collapseDuplicates(order, groupDuplicates(order, (id) => vectors.get(id)))
  const truth = groundTruth[phase]

  rows.push(
    `${step.title.padEnd(22)} phase=${phase.padEnd(8)} rules P@5=${precisionAtK(rules, truth, 5).toFixed(1)}  semantic P@5=${precisionAtK(semantic, truth, 5).toFixed(1)}  conf(top)=${ranked[0].confidence.toFixed(2)}`,
  )
  const watch = 'pay-stripe-webhook'
  rows.push(`  ${watch} rank: rules #${rules.indexOf(watch) + 1}, semantic #${semantic.indexOf(watch) + 1}`)
  if (showTop) {
    rows.push(`  rules:    ${rules.slice(0, 5).map(title).join(' | ')}`)
    rows.push(`  semantic: ${semantic.slice(0, 5).map(title).join(' | ')}`)
  }
}

const sim = (a: string, b: string) => dot(vectors.get(a)!, vectors.get(b)!).toFixed(3)
process.stdout.write(`${rows.join('\n')}\n\nduplicate pair similarity: ${sim('pay-dup-ledger', 'pay-dup-support')}\n`)
