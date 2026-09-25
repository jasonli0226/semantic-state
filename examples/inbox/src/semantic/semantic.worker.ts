import { transformersEmbedder } from 'semantic-state/transformers'
import { defineSemanticWorker } from 'semantic-state/worker'
import { inboxScorer } from '../core/rank.ts'
import type { Item } from '../core/types.ts'
import { DEMO_NOW, embeddingText } from '../data/dataset.ts'
import { EMBEDDING_MODEL, INBOX_DUPLICATE_THRESHOLD, INBOX_INTERESTS, INBOX_RESULT_LIMIT } from './config.ts'

// The whole semantic side of the inbox: embed on write, rank against the attention centroid, fold near-duplicates.
defineSemanticWorker<Item>({
  id: (item) => item.id,
  text: embeddingText,
  embedder: transformersEmbedder({ model: EMBEDDING_MODEL, dtype: 'q8' }),
  interests: INBOX_INTERESTS,
  score: inboxScorer(DEMO_NOW),
  group: { duplicates: { threshold: INBOX_DUPLICATE_THRESHOLD } },
  resultLimit: INBOX_RESULT_LIMIT,
  // The scale test builds synthetic look-alikes from real vectors on the main thread.
  emitVectors: true,
})
