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
}

export interface WorkerPort<T> {
  postMessage(message: FromWorker<T>): void
  addEventListener(type: 'message', listener: (event: MessageEvent<ToWorker<T>>) => void): void
}

export interface RuntimeDeps {
  readonly resourceCount?: () => number
}

const DEFAULT_LIMIT = 40
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function createWorkerRuntime<T>(config: SemanticWorkerConfig<T>, port: WorkerPort<T>, deps: RuntimeDeps = {}) {
  const post = (message: FromWorker<T>) => port.postMessage(message)
  const resourceCount = deps.resourceCount ?? (() => performance.getEntriesByType('resource').length)
  const scorer: Scorer<T> = config.score ?? defaultScorer
  const lanes = config.lanes ?? config.interests.mode === 'multi'
  const limit = config.resultLimit ?? DEFAULT_LIMIT

  let items = new Map<Id, T>()
  let vectors = new Map<Id, Vec>()
  /** Text each vector was computed from — an edited item gets re-embedded. */
  let embeddedText = new Map<Id, string>()
  let precomputedIds = new Set<Id>()
  let extraFeatures: ReadonlyMap<Id, FeatureVectors> = new Map()
  let attention: AttentionState = EMPTY_ATTENTION
  let weights: Weights = config.weights ?? { text: 1 }
  const queries = new Map<string, Vec | null>()
  const queryCache = new Map<string, Vec>()
  let model: 'idle' | 'ready' = 'idle'
  let requestsAtModelReady = 0

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

  async function upsert(incoming: readonly T[], supplied: readonly (readonly [Id, Vec])[] = []) {
    const given = new Map(supplied)
    const stale: T[] = []
    const nextVectors = new Map(vectors)
    const nextText = new Map(embeddedText)
    for (const item of incoming) {
      const id = config.id(item)
      const text = config.text(item)
      const vector = given.get(id)
      if (vector) {
        nextVectors.set(id, vector)
        nextText.set(id, text)
      } else if (precomputedIds.has(id) && !nextText.has(id)) {
        nextText.set(id, text)
      } else if (nextText.get(id) !== text) {
        stale.push(item)
      }
    }
    items = new Map([...items, ...incoming.map((item) => [config.id(item), item] as const)])
    vectors = nextVectors
    embeddedText = nextText

    if (stale.length > 0) {
      try {
        const started = performance.now()
        const fresh = await embed(stale.map(config.text))
        const pairs = stale.map((item, i) => [config.id(item), fresh[i]] as const)
        vectors = new Map([...vectors, ...pairs])
        embeddedText = new Map([...embeddedText, ...stale.map((item) => [config.id(item), config.text(item)] as const)])
        if (config.emitVectors) post({ type: 'embedded', vectors: pairs, embedMs: performance.now() - started })
      } catch (error) {
        post({ type: 'modelError', message: errorMessage(error) })
      }
    }
    refreshFeatures()
  }

  async function watch(query: string) {
    if (queries.has(query)) return
    if (query === '') return void queries.set(query, null)
    let vector = queryCache.get(query) ?? null
    if (!vector) {
      try {
        ;[vector] = await embed([query])
        queryCache.set(query, vector)
        if (config.emitVectors) post({ type: 'queryEmbedded', query, vector })
      } catch (error) {
        post({ type: 'modelError', message: errorMessage(error) })
      }
    }
    queries.set(query, vector)
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

  function rankAll() {
    const all = [...items.values()]
    for (const [query, queryVec] of queries) {
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
  }

  async function handle(message: ToWorker<T>): Promise<void> {
    switch (message.type) {
      case 'upsert':
        await upsert(message.items, message.vectors)
        break
      case 'remove': {
        const gone = new Set(message.ids)
        items = new Map([...items].filter(([id]) => !gone.has(id)))
        refreshFeatures()
        break
      }
      case 'reset': {
        // Vectors stay cached, so re-adding the same items costs no embedding.
        items = new Map()
        attention = EMPTY_ATTENTION
        await upsert(message.items)
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
        await watch(message.query)
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

  port.addEventListener('message', ({ data }) => {
    queue = queue.then(() => handle(data)).catch((error: unknown) => post({ type: 'error', message: errorMessage(error) }))
  })

  return {
    /** Resolves once every queued message has been handled (for tests). */
    idle: () => queue,
  }
}

/** Call from your worker file: `defineSemanticWorker({ id, text, embedder, interests })`. */
export function defineSemanticWorker<T>(config: SemanticWorkerConfig<T>) {
  return createWorkerRuntime(config, self as unknown as WorkerPort<T>)
}
