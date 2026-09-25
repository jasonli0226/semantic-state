import type { Id, Vec, Weights } from '../core/types.ts'
import type { FromWorker, QueryResult, ResultRow, ToWorker } from '../worker/protocol.ts'
import { subscribable } from './subscribable.ts'

/**
 * Main-thread handle on your semantic worker: a framework-free external store
 * (subscribe / getSnapshot). React reads it through the hooks in `semantic-state/react`.
 */

export const MAX_QUERY_LENGTH = 500

/** Queries are trimmed and capped before they reach the worker; results are keyed by the normalized text. */
export const normalizeQuery = (query: string) => query.trim().slice(0, MAX_QUERY_LENGTH)

export interface ModelState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly progress: number
  readonly error: string | null
}

export interface SemanticSnapshot<T> {
  readonly status: 'starting' | 'ready' | 'error'
  readonly error: string | null
  readonly model: ModelState
  readonly results: Readonly<Record<string, QueryResult<T>>>
  /** Keyed `${id}:${k}`. */
  readonly similar: Readonly<Record<string, readonly ResultRow<T>[]>>
  readonly weights: Weights
  readonly lastEmbedMs: number | null
}

export interface WorkerLike<T> {
  postMessage(message: ToWorker<T>): void
  addEventListener(type: 'message', listener: (event: MessageEvent<FromWorker<T>>) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent<FromWorker<T>>) => void): void
  terminate(): void
}

export interface SemanticStore<T> {
  getSnapshot(): SemanticSnapshot<T>
  subscribe(listener: () => void): () => void
  /** Add or update items. Pass `vectors` to skip embedding for items you already have vectors for. */
  upsert(items: readonly T[], options?: { vectors?: readonly (readonly [Id, Vec])[] }): void
  remove(ids: readonly Id[]): void
  /** Replace all items and forget every interaction (cached vectors are kept). */
  reset(items: readonly T[]): void
  interact(id: Id, kind?: string): void
  forget(id: Id): void
  clearInterests(): void
  /** Start ranking for a query; returns a function that stops it. Reference-counted. */
  watch(query: string): () => void
  setWeights(weights: Weights): void
  requestSimilar(id: Id, k: number): void
  onEmbedded(listener: (vectors: readonly (readonly [Id, Vec])[]) => void): () => void
  onQueryEmbedded(listener: (query: string, vector: Vec) => void): () => void
  dispose(): void
}

export const similarKey = (id: Id, k: number) => `${id}:${k}`

const INITIAL: SemanticSnapshot<never> = {
  status: 'starting',
  error: null,
  model: { status: 'idle', progress: 0, error: null },
  results: {},
  similar: {},
  weights: {},
  lastEmbedMs: null,
}

function reduce<T>(s: SemanticSnapshot<T>, m: FromWorker<T>): SemanticSnapshot<T> {
  switch (m.type) {
    case 'ready':
      return { ...s, status: 'ready', weights: m.weights }
    case 'error':
      return { ...s, status: 'error', error: m.message }
    case 'modelProgress':
      return { ...s, model: { status: 'loading', progress: m.progress, error: null } }
    case 'modelReady':
      return { ...s, model: { status: 'ready', progress: 1, error: null } }
    case 'modelError':
      return { ...s, model: { status: 'error', progress: 0, error: m.message } }
    case 'results':
      return { ...s, results: { ...s.results, [m.query]: m.result } }
    case 'similar':
      return { ...s, similar: { ...s.similar, [similarKey(m.id, m.k)]: m.results } }
    case 'embedded':
      return { ...s, lastEmbedMs: m.embedMs }
    case 'queryEmbedded':
      return s
  }
}

/** `worker` is usually `new Worker(new URL('./my.worker.ts', import.meta.url), { type: 'module' })`. */
export function createSemanticStore<T>(worker: WorkerLike<T>): SemanticStore<T> {
  let snapshot: SemanticSnapshot<T> = INITIAL
  const changes = subscribable<[]>()
  const embedded = subscribable<[readonly (readonly [Id, Vec])[]]>()
  const queries = subscribable<[string, Vec]>()
  const watchers = new Map<string, number>()

  const set = (next: SemanticSnapshot<T>) => {
    if (next === snapshot) return
    snapshot = next
    changes.emit()
  }
  const onMessage = ({ data }: MessageEvent<FromWorker<T>>) => {
    if (data.type === 'embedded') embedded.emit(data.vectors)
    if (data.type === 'queryEmbedded') queries.emit(data.query, data.vector)
    set(reduce(snapshot, data))
  }
  worker.addEventListener('message', onMessage)
  const post = (message: ToWorker<T>) => worker.postMessage(message)

  return {
    getSnapshot: () => snapshot,
    subscribe: changes.add,
    upsert: (items, options) => post(options?.vectors ? { type: 'upsert', items, vectors: options.vectors } : { type: 'upsert', items }),
    remove: (ids) => post({ type: 'remove', ids }),
    reset: (items) => post({ type: 'reset', items }),
    interact: (id, kind = 'open') => post({ type: 'interact', id, kind }),
    forget: (id) => post({ type: 'forget', id }),
    clearInterests: () => post({ type: 'clearInterests' }),
    watch(raw) {
      const query = normalizeQuery(raw)
      const count = watchers.get(query) ?? 0
      watchers.set(query, count + 1)
      if (count === 0) post({ type: 'watch', query })
      let stopped = false
      return () => {
        if (stopped) return
        stopped = true
        const left = (watchers.get(query) ?? 1) - 1
        if (left > 0) return void watchers.set(query, left)
        watchers.delete(query)
        post({ type: 'unwatch', query })
      }
    },
    setWeights(weights) {
      set({ ...snapshot, weights })
      post({ type: 'weights', weights })
    },
    requestSimilar: (id, k) => post({ type: 'similar', id, k }),
    onEmbedded: embedded.add,
    onQueryEmbedded: queries.add,
    dispose() {
      worker.removeEventListener('message', onMessage)
      worker.terminate()
    },
  }
}
