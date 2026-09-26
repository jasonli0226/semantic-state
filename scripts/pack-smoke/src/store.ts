import { createSemanticStore } from 'semantic-state'
import { defaultScorer, dot } from 'semantic-state/core'
import type { Note } from './types.js'

export const notes = createSemanticStore<Note>(
  new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' }),
)
notes.upsert([{ id: '1', title: 'Launch', body: 'Ship the launch checklist' }])

// Touch the core entry so its types are checked too.
if (typeof defaultScorer !== 'function' || dot(new Float32Array([1, 0]), new Float32Array([1, 0])) !== 1) {
  throw new Error('semantic-state/core is broken')
}
