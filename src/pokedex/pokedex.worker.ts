import { transformersEmbedder } from 'semantic-state/transformers'
import { defineSemanticWorker, fetchVectorFile } from 'semantic-state/worker'
import { EMBEDDING_MODEL } from '../semantic/config.ts'
import { embeddingTextFor } from './data.ts'
import { pokedexFeatures } from './features.ts'
import { DEFAULT_WEIGHTS, type Pokemon, RESULT_LIMIT } from './types.ts'

const DATA = `${import.meta.env.BASE_URL}pokedex/`

// Vectors were computed at build time (npm run build:pokedex); the model loads only for free-text search.
defineSemanticWorker<Pokemon>({
  id: (p) => p.id,
  text: embeddingTextFor,
  embedder: transformersEmbedder({ model: EMBEDDING_MODEL, dtype: 'q8' }),
  precomputed: () => fetchVectorFile(`${DATA}vectors.bin`, `${DATA}meta.json`),
  features: pokedexFeatures,
  interests: { mode: 'multi' },
  weights: DEFAULT_WEIGHTS,
  group: { key: (p) => p.familyId },
  resultLimit: RESULT_LIMIT,
})
