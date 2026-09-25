import type { Item, Vec } from '../core/types.ts'
import type { InteractionKind } from './config.ts'
import type { EmbeddedVector, FromWorker, QueryResult, ToWorker } from './protocol.ts'
import { subscribable } from './subscribable.ts'

/**
 * Main-thread handle on the semantic worker: a framework-free external store
 * (subscribe / getSnapshot) that React reads through useSyncExternalStore.
 */

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface EngineSnapshot {
  readonly status: EngineStatus
  readonly progress: number
  readonly error: string | null
  readonly results: Readonly<Record<string, QueryResult>>
  readonly lastEmbedMs: number | null
}

export interface WorkerLike {
  postMessage(message: ToWorker): void
  addEventListener(type: 'message', listener: (event: MessageEvent<FromWorker>) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent<FromWorker>) => void): void
  terminate(): void
}

export interface EmbeddedEvent {
  readonly vectors: readonly EmbeddedVector[]
  readonly synthetic: readonly Item[]
}

export interface SemanticEngine {
  getSnapshot(): EngineSnapshot
  subscribe(listener: () => void): () => void
  start(items: readonly Item[]): void
  reset(items: readonly Item[]): void
  upsert(items: readonly Item[]): void
  interact(id: string, kind: InteractionKind): void
  watch(query: string): void
  scale(count: number): void
  onEmbedded(listener: (event: EmbeddedEvent) => void): () => void
  onQueryEmbedded(listener: (query: string, vector: Vec) => void): () => void
  dispose(): void
}

const INITIAL: EngineSnapshot = { status: 'idle', progress: 0, error: null, results: {}, lastEmbedMs: null }

function reduce(snapshot: EngineSnapshot, message: FromWorker): EngineSnapshot {
  switch (message.type) {
    case 'progress':
      return { ...snapshot, progress: message.progress }
    case 'ready':
      return { ...snapshot, status: 'ready', progress: 1 }
    case 'error':
      return { ...snapshot, status: 'error', error: message.message }
    case 'embedded':
      return { ...snapshot, lastEmbedMs: message.embedMs }
    case 'ranked':
      return { ...snapshot, results: { ...snapshot.results, [message.query]: message.result } }
    case 'queryEmbedded':
      return snapshot
  }
}

export function createSemanticEngine(worker: WorkerLike): SemanticEngine {
  let snapshot = INITIAL
  const watched = new Set<string>()
  const changes = subscribable<[]>()
  const embedded = subscribable<[EmbeddedEvent]>()
  const queries = subscribable<[string, Vec]>()

  const onMessage = ({ data }: MessageEvent<FromWorker>) => {
    if (data.type === 'embedded') embedded.emit({ vectors: data.vectors, synthetic: data.synthetic })
    if (data.type === 'queryEmbedded') queries.emit(data.query, data.vector)
    const next = reduce(snapshot, data)
    if (next === snapshot) return
    snapshot = next
    changes.emit()
  }
  worker.addEventListener('message', onMessage)

  const post = (message: ToWorker) => worker.postMessage(message)

  return {
    getSnapshot: () => snapshot,
    subscribe: changes.add,
    start(items) {
      snapshot = { ...snapshot, status: 'loading' }
      changes.emit()
      post({ type: 'init', items })
    },
    reset: (items) => post({ type: 'reset', items }),
    upsert: (items) => post({ type: 'upsert', items }),
    interact: (id, kind) => post({ type: 'interact', id, kind }),
    watch(query) {
      if (watched.has(query)) return
      watched.add(query)
      post({ type: 'watch', query })
    },
    scale: (count) => post({ type: 'scale', count }),
    onEmbedded: embedded.add,
    onQueryEmbedded: queries.add,
    dispose() {
      worker.removeEventListener('message', onMessage)
      worker.terminate()
    },
  }
}
