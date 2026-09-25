import { type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers'
import { type Centroid, EMPTY_CENTROID, observe } from '../core/centroid.ts'
import { collapseDuplicates, groupDuplicates } from '../core/dedupe.ts'
import { rankItems } from '../core/rank.ts'
import { makeSynthetic } from '../core/synthetic.ts'
import type { Item, Vec } from '../core/types.ts'
import { DEMO_NOW, embeddingText } from '../data/dataset.ts'
import { EMBEDDING_MODEL, INTERACTION_STRENGTH } from './config.ts'
import type { EmbeddedVector, FromWorker, ToWorker } from './protocol.ts'

/**
 * Everything semantic lives here, off the main thread: the model, the vector index,
 * the attention centroid and ranking. The UI only ever receives the top of each ranking.
 */

const RESULT_LIMIT = 100
const EMBED_BATCH = 32
const SYNTHETIC_SEED = 42

interface WorkerState {
  readonly items: ReadonlyMap<string, Item>
  readonly vectors: ReadonlyMap<string, Vec>
  /** Text each vector was computed from — an edited item gets re-embedded. */
  readonly embeddedText: ReadonlyMap<string, string>
  readonly centroid: Centroid
  readonly seen: ReadonlySet<string>
  readonly queries: ReadonlyMap<string, Vec>
  readonly syntheticCount: number
}

const scope = self as unknown as {
  postMessage(message: FromWorker): void
  addEventListener(type: 'message', listener: (event: MessageEvent<ToWorker>) => void): void
}
const post = (message: FromWorker) => scope.postMessage(message)

let state: WorkerState = {
  items: new Map(),
  vectors: new Map(),
  embeddedText: new Map(),
  centroid: EMPTY_CENTROID,
  seen: new Set(),
  queries: new Map(),
  syntheticCount: 0,
}

let extractor: Promise<FeatureExtractionPipeline> | null = null
/** Resource-timing entries at the moment the model became ready; everything after is a network call. */
let requestsAtReady: number | null = null
const resourceCount = () => performance.getEntriesByType('resource').length

function loadModel(): Promise<FeatureExtractionPipeline> {
  const fileProgress = new Map<string, { loaded: number; total: number }>()
  extractor ??= pipeline('feature-extraction', EMBEDDING_MODEL, {
    dtype: 'q8',
    progress_callback: (info) => {
      if (info.status !== 'progress') return
      fileProgress.set(info.file, { loaded: info.loaded, total: info.total })
      const totals = [...fileProgress.values()].reduce((acc, f) => ({ loaded: acc.loaded + f.loaded, total: acc.total + f.total }), { loaded: 0, total: 0 })
      if (totals.total > 0) post({ type: 'progress', progress: totals.loaded / totals.total })
    },
  })
  return extractor
}

async function embed(texts: readonly string[]): Promise<Vec[]> {
  const model = await loadModel()
  const out: Vec[] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const tensor = await model(texts.slice(i, i + EMBED_BATCH), { pooling: 'mean', normalize: true })
    const [n, dims] = tensor.dims
    const data = tensor.data as Float32Array
    for (let j = 0; j < n; j++) out.push(data.slice(j * dims, (j + 1) * dims))
  }
  return out
}

/** Embeds only items that are new or whose text changed since they were last embedded. */
async function upsert(items: readonly Item[]): Promise<void> {
  const stale = items.filter((item) => state.embeddedText.get(item.id) !== embeddingText(item))
  const started = performance.now()
  const vecs = await embed(stale.map(embeddingText))
  const embedMs = performance.now() - started
  const fresh: EmbeddedVector[] = stale.map((item, i) => ({ id: item.id, vector: vecs[i] }))

  state = {
    ...state,
    items: new Map([...state.items, ...items.map((item) => [item.id, item] as const)]),
    vectors: new Map([...state.vectors, ...fresh.map((f) => [f.id, f.vector] as const)]),
    embeddedText: new Map([...state.embeddedText, ...stale.map((item) => [item.id, embeddingText(item)] as const)]),
  }
  if (fresh.length > 0) post({ type: 'embedded', vectors: fresh, embedMs, synthetic: [] })
}

async function watch(query: string): Promise<void> {
  if (state.queries.has(query)) return
  const [vector] = await embed([query])
  state = { ...state, queries: new Map([...state.queries, [query, vector]]) }
  post({ type: 'queryEmbedded', query, vector })
}

function interact(id: string, kind: 'open' | 'done'): void {
  const vector = state.vectors.get(id)
  const centroid = vector ? observe(state.centroid, vector, INTERACTION_STRENGTH[kind]) : state.centroid
  const items = kind === 'done' ? new Map([...state.items].filter(([key]) => key !== id)) : state.items
  state = { ...state, centroid, items, seen: new Set([...state.seen, id]) }
}

function scale(count: number): void {
  const bases = [...state.items.values()]
    .filter((item) => !item.id.startsWith('syn-') && state.vectors.has(item.id))
    .map((item) => ({ item, vector: state.vectors.get(item.id)! }))
  const synthetic = makeSynthetic(bases, count, { startIndex: state.syntheticCount, now: DEMO_NOW, seed: SYNTHETIC_SEED + state.syntheticCount })
  state = {
    ...state,
    items: new Map([...state.items, ...synthetic.map((s) => [s.item.id, s.item] as const)]),
    vectors: new Map([...state.vectors, ...synthetic.map((s) => [s.item.id, s.vector] as const)]),
    syntheticCount: state.syntheticCount + count,
  }
  post({ type: 'embedded', vectors: synthetic.map((s) => ({ id: s.item.id, vector: s.vector })), embedMs: 0, synthetic: synthetic.map((s) => s.item) })
}

function rankAll(): void {
  const items = [...state.items.values()]
  const getVector = (id: string) => state.vectors.get(id)
  for (const [query, queryVec] of state.queries) {
    const started = performance.now()
    const ranked = rankItems(items, { getVector, queryVec, centroid: state.centroid, now: DEMO_NOW, seen: state.seen })
    const order = ranked.map((r) => r.id)
    const duplicates = groupDuplicates(order, getVector)
    const visible = new Set(collapseDuplicates(order, duplicates).slice(0, RESULT_LIMIT))
    const top = ranked.filter((r) => visible.has(r.id))
    post({ type: 'ranked', query, result: { ranked: top, duplicates, rankMs: performance.now() - started, itemCount: items.length, updatedAt: Date.now(), networkRequests: requestsAtReady === null ? 0 : resourceCount() - requestsAtReady } })
  }
}

async function handle(message: ToWorker): Promise<void> {
  switch (message.type) {
    case 'init':
      await loadModel()
      await upsert(message.items)
      requestsAtReady = resourceCount()
      post({ type: 'ready' })
      break
    case 'reset':
      // Real items keep their vectors (no re-embedding); synthetic ones are dropped.
      state = {
        ...state,
        items: new Map(),
        vectors: new Map([...state.vectors].filter(([id]) => !id.startsWith('syn-'))),
        centroid: EMPTY_CENTROID,
        seen: new Set(),
        syntheticCount: 0,
      }
      await upsert(message.items)
      break
    case 'upsert':
      await upsert(message.items)
      break
    case 'watch':
      await watch(message.query)
      break
    case 'interact':
      interact(message.id, message.kind)
      break
    case 'scale':
      scale(message.count)
      break
  }
  rankAll()
}

// Messages are handled strictly in order: a 'watch' sent during model download waits for 'init'.
let queue: Promise<void> = Promise.resolve()
scope.addEventListener('message', ({ data }) => {
  queue = queue
    .then(() => handle(data))
    .catch((error: unknown) => post({ type: 'error', message: error instanceof Error ? error.message : String(error) }))
})
