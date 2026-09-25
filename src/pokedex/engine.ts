import { subscribable } from '../semantic/subscribable.ts'
import type { PokedexFromWorker, PokedexResult, PokedexToWorker } from './protocol.ts'
import type { RankedPokemon } from './rank.ts'
import { DEFAULT_WEIGHTS, type Pokemon, type SimilarityWeights } from './types.ts'

/** Main-thread handle on the Pokédex worker; React reads it through useSyncExternalStore. No Redux. */

export const MAX_QUERY_LENGTH = 200

export interface PokedexSnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly error: string | null
  /** The embedding model loads only when the user first searches. */
  readonly model: { readonly status: 'idle' | 'loading' | 'ready' | 'error'; readonly progress: number; readonly error?: string }
  readonly pokedex: readonly Pokemon[]
  readonly byId: ReadonlyMap<number, Pokemon>
  readonly result: PokedexResult | null
  readonly similar: { readonly id: number; readonly results: readonly RankedPokemon[] } | null
  readonly weights: SimilarityWeights
}

export interface PokedexWorker {
  postMessage(message: PokedexToWorker): void
  addEventListener(type: 'message', listener: (event: MessageEvent<PokedexFromWorker>) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent<PokedexFromWorker>) => void): void
  terminate(): void
}

export interface PokedexEngine {
  getSnapshot(): PokedexSnapshot
  subscribe(listener: () => void): () => void
  start(): void
  search(text: string): void
  click(id: number): void
  forget(id: number): void
  clear(): void
  setWeights(weights: SimilarityWeights): void
  similar(id: number): void
  dispose(): void
}

const INITIAL: PokedexSnapshot = {
  status: 'idle',
  error: null,
  model: { status: 'idle', progress: 0 },
  pokedex: [],
  byId: new Map(),
  result: null,
  similar: null,
  weights: DEFAULT_WEIGHTS,
}

function reduce(snapshot: PokedexSnapshot, message: PokedexFromWorker): PokedexSnapshot {
  switch (message.type) {
    case 'loaded':
      return { ...snapshot, status: 'ready', pokedex: message.pokedex, byId: new Map(message.pokedex.map((p) => [p.id, p])) }
    case 'modelProgress':
      return { ...snapshot, model: { status: 'loading', progress: message.progress } }
    case 'modelReady':
      return { ...snapshot, model: { status: 'ready', progress: 1 } }
    case 'error':
      return { ...snapshot, status: 'error', error: message.message }
    case 'modelError':
      return { ...snapshot, model: { status: 'error', progress: 0, error: message.message } }
    case 'ranked':
      return { ...snapshot, result: message.result }
    case 'similar':
      return { ...snapshot, similar: { id: message.id, results: message.results } }
  }
}

export function createPokedexEngine(worker: PokedexWorker): PokedexEngine {
  let snapshot = INITIAL
  const changes = subscribable<[]>()
  const set = (next: PokedexSnapshot) => {
    snapshot = next
    changes.emit()
  }
  const onMessage = ({ data }: MessageEvent<PokedexFromWorker>) => set(reduce(snapshot, data))
  worker.addEventListener('message', onMessage)
  const post = (message: PokedexToWorker) => worker.postMessage(message)

  return {
    getSnapshot: () => snapshot,
    subscribe: changes.add,
    start() {
      set({ ...snapshot, status: 'loading' })
      post({ type: 'init' })
    },
    search: (text) => post({ type: 'search', text: text.trim().slice(0, MAX_QUERY_LENGTH) }),
    click: (id) => post({ type: 'click', id }),
    forget: (id) => post({ type: 'forget', id }),
    clear: () => post({ type: 'clear' }),
    setWeights(weights) {
      set({ ...snapshot, weights })
      post({ type: 'weights', weights })
    },
    similar: (id) => post({ type: 'similar', id }),
    dispose() {
      worker.removeEventListener('message', onMessage)
      worker.terminate()
    },
  }
}
