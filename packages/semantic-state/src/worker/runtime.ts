import type { VectorCache } from '../cache/vectorCache.ts'
import { type AttentionState, EMPTY_ATTENTION, type InterestConfig, forgetInteraction, recordInteraction } from '../core/attention.ts'
import { type Grouping, type Scorer, defaultScorer, rankForDisplay, scoreAll, similarTo } from '../core/rank.ts'
import type { FeatureVectors, Id, Scored, Vec, Weights } from '../core/types.ts'
import type { Embedder } from './embedder.ts'
import type { FromWorker, ResultRow, ToWorker } from './protocol.ts'

/**
 * Everything semantic runs here, off the main thread. The app writes a tiny worker file that calls
 * defineSemanticWorker(config), so functions (text, features, scoring) never cross threads.
 */
export interface SemanticWorkerConfig<T> {
  readonly id: (item: T) => Id
  /** What gets embedded for an item. */
  readonly text: (item: T) => string
  readonly embedder: Embedder
  /** Extra named vectors next to `text` (e.g. one-hot types). Receives every item, so it can normalize across them. */
  readonly features?: (items: readonly T[]) => ReadonlyMap<Id, FeatureVectors>
  /** Vectors computed ahead of time (see fetchVectorFile); those items skip embedding. */
  readonly precomputed?: () => Promise<Iterable<readonly [Id, Vec]>>
  /** Keeps item vectors between visits (see indexedDbVectorCache); items whose text is unchanged skip embedding. */
  readonly vectorCache?: VectorCache
  readonly interests: InterestConfig
  /** Combines the signals into a score. Defaults to a 60/40 query/interest blend. */
  readonly score?: Scorer<T>
  /** Initial feature weights. Default { text: 1 }. */
  readonly weights?: Weights
  /** Fold results: by a key (e.g. family), or near-duplicates by text vector. */
  readonly group?: { readonly key: (item: T) => Id } | { readonly duplicates: { readonly threshold: number; readonly scanLimit?: number } }
  /** Interleave interest lanes. Default: on in multi mode. */
  readonly lanes?: boolean
  /** Results sent to the main thread per query. Default 40. */
  readonly resultLimit?: number
  /** Also post new embeddings to the main thread (for baselines that rank elsewhere). Vectors you supplied are not echoed. */
  readonly emitVectors?: boolean
  /** Items per embed() call. Between batches the worker handles other messages and re-ranks. Default 32. */
  readonly embedBatchSize?: number
}

export interface WorkerPort<T> {
  postMessage(message: FromWorker<T>): void
  addEventListener(type: 'message', listener: (event: MessageEvent<ToWorker<T>>) => void): void
}

export interface RuntimeDeps {
  readonly resourceCount?: () => number
}

const DEFAULT_LIMIT = 40
const DEFAULT_EMBED_BATCH = 32
/** During an embed job, re-rank at most this often (the first batch and the end always rank). */
const RANK_THROTTLE_MS = 250
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function createWorkerRuntime<T>(config: SemanticWorkerConfig<T>, port: WorkerPort<T>, deps: RuntimeDeps = {}) {
  const post = (message: FromWorker<T>) => port.postMessage(message)
  const resourceCount = deps.resourceCount ?? (() => performance.getEntriesByType('resource').length)
  const scorer: Scorer<T> = config.score ?? defaultScorer
  const lanes = config.lanes ?? config.interests.mode === 'multi'
  const limit = config.resultLimit ?? DEFAULT_LIMIT
  const batchSize = Number.isFinite(config.embedBatchSize) ? Math.max(1, Math.floor(config.embedBatchSize!)) : DEFAULT_EMBED_BATCH

  let items = new Map<Id, T>()
  let vectors = new Map<Id, Vec>()
  /** Text each vector was computed from — an edited item gets re-embedded. */
  let embeddedText = new Map<Id, string>()
  let precomputedIds = new Set<Id>()
  let extraFeatures: ReadonlyMap<Id, FeatureVectors> = new Map()
  let attention: AttentionState = EMPTY_ATTENTION
  let weights: Weights = config.weights ?? { text: 1 }
  /** 'embedding': the query's vector is on its way (see embedQuery); until then it ranks by interests only. */
  const queries = new Map<string, Vec | null | 'embedding'>()
  const queryCache = new Map<string, Vec>()
  const queryEmbeds = new Map<string, Promise<void>>()
  /** Cache writes in flight; only `idle()` waits for them. */
  let writes = new Set<Promise<void>>()
  let model: 'idle' | 'ready' = 'idle'
  let requestsAtModelReady = 0
  /** Ids whose current text has no vector yet, in the order they were queued. Drained by the embed job. */
  let pending = new Set<Id>()
  /** The batch in flight; null when no job is running. Only queued tasks start, continue or end a job. */
  let job: Promise<void> | null = null
  let progress = { done: 0, total: 0 }
  let rankedThisJob = false
  let lastRankAt = Number.NEGATIVE_INFINITY

  const featuresOf = (id: Id): FeatureVectors | undefined => {
    const text = vectors.get(id)
    const extra = extraFeatures.get(id)
    if (!text && !extra) return undefined
    return text ? { ...extra, text } : extra
  }

  async function embed(texts: readonly string[]): Promise<Vec[]> {
    const result = await config.embedder.embed(texts, (progress) => post({ type: 'modelProgress', progress }))
    if (model === 'idle') {
      model = 'ready'
      requestsAtModelReady = resourceCount()
      post({ type: 'modelReady' })
    }
    return result
  }

  function refreshFeatures() {
    extraFeatures = config.features ? config.features([...items.values()]) : new Map()
  }

  /** Where an incoming item's vector comes from. `known`: the text each current vector was computed from. */
  function sourceOf(id: Id, text: string, given: ReadonlyMap<Id, Vec>, known: ReadonlyMap<Id, string>): 'given' | 'precomputed' | 'current' | 'stale' {
    if (given.has(id)) return 'given'
    if (precomputedIds.has(id) && !known.has(id)) return 'precomputed'
    return known.get(id) === text ? 'current' : 'stale'
  }

  /** Cached vectors for the incoming items that would otherwise be embedded. A failing cache means "embed as usual". */
  async function fromCache(incoming: readonly T[], supplied: readonly (readonly [Id, Vec])[] = []): Promise<(readonly [Id, Vec])[]> {
    if (!config.vectorCache) return []
    const given = new Map(supplied)
    // One entry per id, with its last text: the one `upsert` keeps.
    const latest = new Map(incoming.map((item) => [config.id(item), config.text(item)] as const))
    const wanted = [...latest].filter(([id, text]) => sourceOf(id, text, given, embeddedText) === 'stale')
    if (wanted.length === 0) return []
    try {
      const found = await config.vectorCache.get(wanted)
      const hits = wanted.flatMap(([id]) => {
        const vector = found.get(id)
        return vector === undefined ? [] : [[id, vector] as const]
      })
      // Found, not supplied by the app, so echo them like fresh embeddings.
      if (config.emitVectors && hits.length > 0) post({ type: 'embedded', vectors: hits, embedMs: 0, cached: true })
      return hits
    } catch (error) {
      console.warn(`[semantic-state] vector cache read failed, embedding instead: ${errorMessage(error)}`)
      return []
    }
  }

  /** Outside the queue: embedding never waits on disk. */
  function toCache(entries: readonly (readonly [Id, string, Vec])[]) {
    const cache = config.vectorCache
    if (!cache || entries.length === 0) return
    const write = Promise.resolve()
      .then(() => cache.set(entries))
      .catch((error: unknown) => console.warn(`[semantic-state] vector cache write failed: ${errorMessage(error)}`))
    writes = new Set([...writes, write])
    void write.then(() => {
      writes = new Set([...writes].filter((w) => w !== write))
    })
  }

  /** Stores items and supplied vectors and queues stale items for the embed job. Returns true if it queued new ids. */
  function upsert(incoming: readonly T[], supplied: readonly (readonly [Id, Vec])[] = []): boolean {
    const given = new Map(supplied)
    const stale = new Set<Id>()
    const settled = new Set<Id>()
    const nextVectors = new Map(vectors)
    const nextText = new Map(embeddedText)
    for (const item of incoming) {
      const id = config.id(item)
      const text = config.text(item)
      switch (sourceOf(id, text, given, nextText)) {
        case 'given':
          nextVectors.set(id, given.get(id)!)
          nextText.set(id, text)
          settled.add(id)
          break
        case 'precomputed':
          nextText.set(id, text)
          settled.add(id)
          break
        case 'current':
          settled.add(id)
          break
        case 'stale':
          stale.add(id)
      }
    }
    items = new Map([...items, ...incoming.map((item) => [config.id(item), item] as const)])
    vectors = nextVectors
    embeddedText = nextText
    const added = [...stale].filter((id) => !pending.has(id))
    pending = new Set([...[...pending].filter((id) => !settled.has(id)), ...added])
    progress = { ...progress, total: progress.total + added.length }
    refreshFeatures()
    // Stale ids that were already queued need no new batch; the caller ranks the updated items at once.
    // (No job running means nothing is queued, so new stale ids always land in `added`.)
    if (added.length === 0) return false
    if (job === null) startJob()
    return true
  }

  function startJob() {
    rankedThisJob = false
    post({ type: 'embedProgress', ...progress })
    job = embedBatch(takeBatch())
  }

  /** Runs inside the queue. Ids stay in `pending` until their vectors are applied. */
  function takeBatch(): readonly (readonly [Id, string])[] {
    return [...pending].slice(0, batchSize).flatMap((id) => {
      const item = items.get(id)
      return item === undefined ? [] : [[id, config.text(item)] as const]
    })
  }

  /** Embeds outside the queue (the model may still be downloading), then applies the result through it. */
  async function embedBatch(batch: readonly (readonly [Id, string])[]) {
    const started = performance.now()
    try {
      const fresh = await embed(batch.map(([, text]) => text))
      const embedMs = performance.now() - started // measured here: time spent waiting in the queue is not embedding
      enqueueJobStep(() => applyBatch(batch, fresh, embedMs))
    } catch (error) {
      enqueueJobStep(() => failJob(error))
    }
  }

  /** A job step that throws (e.g. an app-supplied `score` or `features`) ends the job, so later upserts start a new one. */
  function enqueueJobStep(step: () => void) {
    enqueue(() => {
      try {
        step()
      } catch (error) {
        post({ type: 'embedProgress', done: progress.total, total: progress.total })
        pending = new Set()
        progress = { done: 0, total: 0 }
        job = null
        throw error // enqueue posts it as an `error` message
      }
    })
  }

  /** Ranks for the job and restarts its throttle clock; clicks and other messages don't touch that clock. */
  function rankForJob() {
    lastRankAt = performance.now()
    rankAll()
  }

  /** Runs inside the queue: store what is still current, then take the next batch or finish. */
  function applyBatch(batch: readonly (readonly [Id, string])[], fresh: readonly Vec[], embedMs: number) {
    // Only if the id is still queued with the same text: an edit, remove or supplied vector mid-batch wins.
    const kept = batch.flatMap(([id, text], i) => {
      const item = items.get(id)
      return pending.has(id) && item !== undefined && config.text(item) === text ? [[id, text, fresh[i]] as const] : []
    })
    const stored = kept.map(([id, , vector]) => [id, vector] as const)
    const storedIds = new Set(stored.map(([id]) => id))
    vectors = new Map([...vectors, ...stored])
    embeddedText = new Map([...embeddedText, ...kept.map(([id, text]) => [id, text] as const)])
    toCache(kept)
    pending = new Set([...pending].filter((id) => !storedIds.has(id)))
    progress = { ...progress, done: progress.done + stored.length }
    refreshFeatures()
    if (config.emitVectors && stored.length > 0) post({ type: 'embedded', vectors: stored, embedMs })
    if (pending.size === 0) return finishJob()
    post({ type: 'embedProgress', ...progress })
    if (!rankedThisJob || performance.now() - lastRankAt >= RANK_THROTTLE_MS) {
      rankedThisJob = true
      rankForJob()
    }
    job = embedBatch(takeBatch())
  }

  function finishJob() {
    post({ type: 'embedProgress', done: progress.total, total: progress.total })
    progress = { done: 0, total: 0 }
    job = null
    rankForJob()
  }

  function failJob(error: unknown) {
    post({ type: 'modelError', message: errorMessage(error) })
    pending = new Set()
    finishJob()
  }

  /** Returns true when the query still needs embedding; it is ranked once its vector arrives. */
  function watch(query: string): boolean {
    if (queries.has(query)) return false
    const known = query === '' ? null : queryCache.get(query)
    if (known !== undefined) {
      queries.set(query, known)
      return false
    }
    queries.set(query, 'embedding')
    if (!queryEmbeds.has(query)) queryEmbeds.set(query, embedQuery(query))
    return true
  }

  /**
   * Runs outside the serial queue: the first query may wait on a model download, and clicks,
   * similar-item requests and weights must not wait with it. The ranking goes back through the queue.
   */
  async function embedQuery(query: string) {
    let vector: Vec | null = null
    try {
      ;[vector] = await embed([query])
      queryCache.set(query, vector)
      if (config.emitVectors) post({ type: 'queryEmbedded', query, vector })
    } catch (error) {
      post({ type: 'modelError', message: errorMessage(error) })
    }
    queryEmbeds.delete(query)
    enqueue(() => {
      if (queries.get(query) !== 'embedding') return // unwatched meanwhile
      queries.set(query, vector)
      rankQuery(query, vector, [...items.values()])
    })
  }

  const groupKey = (id: Id): Id | undefined => {
    if (!config.group || !('key' in config.group)) return undefined
    const item = items.get(id)
    return item === undefined ? undefined : config.group.key(item)
  }

  function grouping(): Grouping | undefined {
    if (!config.group) return undefined
    if ('key' in config.group) return { kind: 'key', of: groupKey }
    return { kind: 'duplicates', vectorOf: (id) => vectors.get(id), ...config.group.duplicates }
  }

  const withItems = (rows: readonly Scored[]): ResultRow<T>[] =>
    rows.flatMap((r) => {
      const item = items.get(r.id)
      return item === undefined ? [] : [{ ...r, item }]
    })

  function rankQuery(query: string, queryVec: Vec | null, all: readonly T[]) {
    const started = performance.now()
    const scored = scoreAll({ items: all, idOf: config.id, features: featuresOf, queryVec, attention, interests: config.interests, weights, scorer })
    const { ranked, extras } = rankForDisplay(scored, { group: grouping(), lanes, limit })
    post({
      type: 'results',
      query,
      result: {
        ranked: withItems(ranked),
        extras: [...extras],
        interests: attention.interests.map((i) => ({ ...i, item: items.get(i.id) })),
        rankMs: performance.now() - started,
        itemCount: all.length,
        updatedAt: Date.now(),
        networkRequests: model === 'ready' ? resourceCount() - requestsAtModelReady : null,
      },
    })
  }

  function rankAll() {
    const all = [...items.values()]
    for (const [query, queryVec] of queries) rankQuery(query, queryVec === 'embedding' ? null : queryVec, all)
  }

  async function handle(message: ToWorker<T>): Promise<void> {
    switch (message.type) {
      case 'upsert': {
        // Cache hits take the supplied-vector path: settled at once, never queued for embedding.
        const hits = await fromCache(message.items, message.vectors)
        if (upsert(message.items, [...(message.vectors ?? []), ...hits])) return // ranked when its first batch is applied
        break
      }
      case 'remove': {
        const gone = new Set(message.ids)
        items = new Map([...items].filter(([id]) => !gone.has(id)))
        pending = new Set([...pending].filter((id) => !gone.has(id)))
        refreshFeatures()
        break
      }
      case 'reset': {
        const hits = await fromCache(message.items)
        // Vectors stay cached, so re-adding the same items costs no embedding.
        items = new Map()
        attention = EMPTY_ATTENTION
        const kept = new Set(message.items.map(config.id))
        pending = new Set([...pending].filter((id) => kept.has(id)))
        if (upsert(message.items, hits)) return
        break
      }
      case 'interact':
        attention = recordInteraction(attention, message.id, message.kind, vectors.get(message.id), config.interests)
        break
      case 'forget':
        attention = forgetInteraction(attention, message.id)
        break
      case 'clearInterests':
        attention = EMPTY_ATTENTION
        break
      case 'watch':
        if (watch(message.query)) return
        break
      case 'unwatch':
        queries.delete(message.query)
        return
      case 'weights':
        weights = message.weights
        break
      case 'similar': {
        const results = similarTo(
          message.id,
          { items: [...items.values()], idOf: config.id, features: featuresOf, weights, groupOf: config.group && 'key' in config.group ? groupKey : undefined },
          message.k,
        )
        post({ type: 'similar', id: message.id, k: message.k, results: withItems(results) })
        return
      }
    }
    rankAll()
  }

  // Start-up (precomputed vectors) and every message run strictly in order.
  let queue: Promise<void> = (async () => {
    try {
      if (config.precomputed) {
        const loaded = [...(await config.precomputed())]
        vectors = new Map(loaded)
        precomputedIds = new Set(loaded.map(([id]) => id))
      }
      post({ type: 'ready', weights })
    } catch (error) {
      post({ type: 'error', message: errorMessage(error) })
    }
  })()

  function enqueue(task: () => void | Promise<void>) {
    queue = queue.then(task).catch((error: unknown) => post({ type: 'error', message: errorMessage(error) }))
  }

  port.addEventListener('message', ({ data }) => enqueue(() => handle(data)))

  return {
    /** Resolves once every queued message, query embedding, the embed job and cache writes have been handled (for tests). */
    async idle() {
      for (;;) {
        const current = queue
        await Promise.all([current, job, ...queryEmbeds.values(), ...writes])
        if (current === queue && job === null && queryEmbeds.size === 0 && writes.size === 0) return
      }
    },
  }
}

/** Call from your worker file: `defineSemanticWorker({ id, text, embedder, interests })`. */
export function defineSemanticWorker<T>(config: SemanticWorkerConfig<T>) {
  return createWorkerRuntime(config, self as unknown as WorkerPort<T>)
}
