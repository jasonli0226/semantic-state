import { transformersEmbedder } from 'semantic-state/transformers'
import { defineSemanticWorker } from 'semantic-state/worker'
import { EMBEDDING_MODEL, RESULT_LIMIT } from './config.ts'
import { embeddingTextFor } from './data.ts'
import { wikiFeatures } from './features.ts'
import { type Article, DEFAULT_WEIGHTS } from './types.ts'

// No `precomputed`: the main thread passes vectors with upsert (see source.ts), so a future
// source without vectors makes this worker embed the articles instead. The model loads only for search.
defineSemanticWorker<Article>({
  id: (a) => a.id,
  text: embeddingTextFor,
  embedder: transformersEmbedder({ model: EMBEDDING_MODEL, dtype: 'q8' }),
  features: wikiFeatures,
  interests: { mode: 'multi' },
  weights: DEFAULT_WEIGHTS,
  resultLimit: RESULT_LIMIT,
  // Sends each new query vector to the main thread, which picks the search seed by the query alone.
  // Vectors passed in with upsert are not echoed back.
  emitVectors: true,
})
