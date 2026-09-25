import { type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers'
import type { Vec } from '../core/types.ts'
import { EMBEDDING_MODEL } from '../semantic/config.ts'
import { decodeVectors, parsePokedex } from './data.ts'
import { type Features, buildFeatures } from './features.ts'
import type { PokedexFromWorker, PokedexToWorker } from './protocol.ts'
import { type Interest, addInterest, rankForDisplay, removeInterest, similarTo } from './rank.ts'
import { DEFAULT_WEIGHTS, type Pokemon, type SimilarityWeights } from './types.ts'

/**
 * Pokédex vectors are precomputed at build time (scripts/build-pokedex.ts), so the dex is usable
 * immediately. The model is downloaded only when the user first types a search.
 */

const RESULT_LIMIT = 40
const SIMILAR_LIMIT = 6
const DATA_URL = `${import.meta.env.BASE_URL}pokedex/`

interface State {
  readonly pokedex: readonly Pokemon[]
  readonly features: ReadonlyMap<number, Features>
  readonly interests: readonly Interest[]
  readonly weights: SimilarityWeights
  readonly query: string
  readonly queryVec: Vec | null
}

const scope = self as unknown as {
  postMessage(message: PokedexFromWorker): void
  addEventListener(type: 'message', listener: (event: MessageEvent<PokedexToWorker>) => void): void
}
const post = (message: PokedexFromWorker) => scope.postMessage(message)

let state: State = { pokedex: [], features: new Map(), interests: [], weights: DEFAULT_WEIGHTS, query: '', queryVec: null }
let extractor: Promise<FeatureExtractionPipeline> | null = null
let requestsAtModelReady: number | null = null
const queryCache = new Map<string, Vec>()
const resourceCount = () => performance.getEntriesByType('resource').length

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`)
  return response
}

async function load(): Promise<void> {
  const [json, meta, bin] = await Promise.all([
    fetchOk(`${DATA_URL}pokedex.json`).then((r) => r.json()),
    fetchOk(`${DATA_URL}meta.json`).then((r) => r.json() as Promise<{ count: number; dims: number }>),
    fetchOk(`${DATA_URL}vectors.bin`).then((r) => r.arrayBuffer()),
  ])
  const pokedex = parsePokedex(json)
  if (meta.count !== pokedex.length) throw new Error(`meta.json says ${meta.count} Pokémon, pokedex.json has ${pokedex.length}`)
  state = { ...state, pokedex, features: buildFeatures(pokedex, decodeVectors(bin, meta.count, meta.dims)) }
  post({ type: 'loaded', pokedex })
}

function loadModel(): Promise<FeatureExtractionPipeline> {
  const files = new Map<string, { loaded: number; total: number }>()
  extractor ??= pipeline('feature-extraction', EMBEDDING_MODEL, {
    dtype: 'q8',
    progress_callback: (info) => {
      if (info.status !== 'progress') return
      files.set(info.file, { loaded: info.loaded, total: info.total })
      const t = [...files.values()].reduce((a, f) => ({ loaded: a.loaded + f.loaded, total: a.total + f.total }), { loaded: 0, total: 0 })
      if (t.total > 0) post({ type: 'modelProgress', progress: t.loaded / t.total })
    },
  }).then((model) => {
    requestsAtModelReady = resourceCount()
    post({ type: 'modelReady' })
    return model
  })
  return extractor
}

async function embedQuery(text: string): Promise<Vec | null> {
  if (text === '') return null
  const cached = queryCache.get(text)
  if (cached) return cached
  const model = await loadModel()
  const vec = (await model(text, { pooling: 'mean', normalize: true })).data as Float32Array
  queryCache.set(text, vec)
  return vec
}

function rank(): void {
  const started = performance.now()
  const { ranked, familyExtras } = rankForDisplay(
    state.pokedex,
    { features: state.features, interests: state.interests, queryVec: state.queryVec, weights: state.weights },
    RESULT_LIMIT,
  )
  post({
    type: 'ranked',
    result: {
      ranked,
      familyExtras: [...familyExtras],
      interests: state.interests,
      query: state.query,
      rankMs: performance.now() - started,
      networkRequests: requestsAtModelReady === null ? null : resourceCount() - requestsAtModelReady,
    },
  })
}

async function handle(message: PokedexToWorker): Promise<void> {
  switch (message.type) {
    case 'init':
      return load()
    case 'search': {
      try {
        state = { ...state, query: message.text, queryVec: await embedQuery(message.text) }
      } catch (error) {
        extractor = null // allow a retry on the next search
        post({ type: 'modelError', message: error instanceof Error ? error.message : String(error) })
        state = { ...state, query: '', queryVec: null }
      }
      break
    }
    case 'click':
      state = { ...state, interests: addInterest(state.interests, message.id) }
      break
    case 'forget':
      state = { ...state, interests: removeInterest(state.interests, message.id) }
      break
    case 'clear':
      state = { ...state, interests: [] }
      break
    case 'weights':
      state = { ...state, weights: message.weights }
      break
    case 'similar':
      post({ type: 'similar', id: message.id, results: similarTo(message.id, state.pokedex, state.features, state.weights, SIMILAR_LIMIT) })
      return
  }
  rank()
}

// Strictly ordered: a search typed while the dex is still loading waits for 'init'.
let queue: Promise<void> = Promise.resolve()
scope.addEventListener('message', ({ data }) => {
  queue = queue
    .then(() => handle(data))
    .catch((error: unknown) => post({ type: 'error', message: error instanceof Error ? error.message : String(error) }))
})
