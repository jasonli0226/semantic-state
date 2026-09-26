import { transformersEmbedder } from 'semantic-state/transformers'
import { defineSemanticWorker } from 'semantic-state/worker'
import type { Note } from './types.js'

defineSemanticWorker<Note>({
  id: (note) => note.id,
  text: (note) => `${note.title}. ${note.body}`,
  embedder: transformersEmbedder({ model: 'Xenova/all-MiniLM-L6-v2' }),
  interests: { mode: 'multi' },
})
