# semantic-state

[![npm](https://img.shields.io/npm/v/semantic-state/experimental?label=npm%40experimental)](https://www.npmjs.com/package/semantic-state)

> **Experimental prerelease (`0.1.0-experimental.0`).** APIs will change between versions; pin the exact version.

React state that is **ranked by meaning instead of looked up by key**, computed on-device in a Web Worker.

- `useSemantic('what needs my attention right now')` subscribes to a relevance query and returns `Belief<T>[]`:
  your items, each with a confidence and a reason (*matches the query* / *like the item you clicked*).
- Interactions (`store.interact(id)`) teach it what the user cares about: one drifting focus (centroid) or several
  interests at once (multi-interest, with lanes so the newest click doesn't take every slot).
- A **commit policy** keeps the visible list still while the user is working in it; the fresh ranking is applied when
  they pause, leave, or press Refresh.
- Embeddings run in the worker with [transformers.js](https://huggingface.co/docs/transformers.js) (optional) or come
  precomputed from a file. Item text never leaves the device.
- No Redux or other state manager needed. Keep exact state (forms, selection, carts) wherever you already keep it.

## Install

```bash
npm install semantic-state@experimental react
npm install @huggingface/transformers   # optional: on-device embeddings via transformersEmbedder
```

ESM only. Needs a bundler that handles `new Worker(new URL('./x.worker.ts', import.meta.url))` (Vite, webpack 5, …).

## Quick start

**1. A worker file** — your config lives here, so functions never have to cross threads.

```ts
// search.worker.ts
import { transformersEmbedder } from 'semantic-state/transformers'
import { defineSemanticWorker } from 'semantic-state/worker'
import type { Note } from './types'

defineSemanticWorker<Note>({
  id: (note) => note.id,
  text: (note) => `${note.title}. ${note.body}`,          // what gets embedded
  embedder: transformersEmbedder({ model: 'Xenova/all-MiniLM-L6-v2' }),
  interests: { mode: 'multi' },                            // or { mode: 'centroid' }
})
```

**2. A store** — one per worker, created once.

```ts
import { createSemanticStore } from 'semantic-state'

export const notes = createSemanticStore<Note>(
  new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' }),
)
notes.upsert(allNotes) // embeds new or edited items; unchanged ones are skipped
```

**3. Components**

```tsx
import { SemanticProvider, useSemantic } from 'semantic-state/react'

<SemanticProvider store={notes}>
  <Suggestions />
</SemanticProvider>

function Suggestions() {
  const { beliefs, panelProps, pending, commit } = useSemantic<Note>('notes about the launch')
  return (
    <ul {...panelProps}>
      {beliefs.map(({ value: note, confidence, reason }) => (
        <li key={note.id} style={{ opacity: confidence < 0.35 ? 0.6 : 1 }} onClick={() => notes.interact(note.id)}>
          {note.title} <small>{reason.kind}</small>
        </li>
      ))}
    </ul>
  )
}
```

Spread `panelProps` on the list: pointer and keyboard activity inside it holds the order (default `onIdle` policy).

## Concepts

| Concept | What it does |
|---|---|
| **Worker file** | `defineSemanticWorker(config)` holds `id`, `text`, `embedder`, optional `features`, `score`, `group`. Your bundler builds it like any worker. |
| **Attention: `centroid`** | One decayed average of everything interacted with, with per-kind `strength` (e.g. `{ open: 1, done: 1.5 }`). Good for a single focus that drifts. |
| **Attention: `multi`** | Each recent interaction kept separately (decay 0.75, max 6); a candidate scores by its best match, and results are interleaved by lane. Interacted items are left out by default. |
| **Features + weights** | `features(items)` adds named vectors next to `text` (e.g. one-hot types). `store.setWeights({ text: 1, type: 0.5 })` changes what "similar" means at runtime. |
| **Scorer** | `score(input)` combines `querySim`, `interest`, `history`, `interacted` into `{ score, confidence, reason }` — add deadlines, boosts or penalties here. Default: 60/40 query/interest blend. |
| **Grouping** | `group: { key: (item) => familyId }` or `group: { duplicates: { threshold } }` folds results; `Belief.groupExtras` says how many were folded. |
| **Precomputed vectors** | `precomputed: () => fetchVectorFile(vectorsUrl, metaUrl)` — build-time embeddings, so a large static catalogue needs no model until the user types a search. |
| **Commit policy** | `onIdle` (after the pointer rests ~2 s or leaves), `manual` (`pending` counts + `commit()`), `live`. Hysteresis stops tiny score changes from reordering. |

## API

| Import | Exports |
|---|---|
| `semantic-state` | `createSemanticStore`, `normalizeQuery`, types (`Belief`, `Reason`, `Id`, `Weights`, `QueryResult`, `ResultRow`, `SemanticSnapshot`, `ModelState`) |
| `semantic-state/react` | `SemanticProvider`, `useSemantic`, `useSimilar`, `useSemanticSnapshot`, `useSemanticStore`, `useCommitPolicy`, `useActivity` |
| `semantic-state/worker` | `defineSemanticWorker`, `createWorkerRuntime` (testable with a fake port), `fetchVectorFile`, `decodeVectorFile`, `Embedder` |
| `semantic-state/transformers` | `transformersEmbedder({ model, dtype, batchSize })` — needs `@huggingface/transformers` |
| `semantic-state/core` | Pure functions: `scoreAll`, `rankForDisplay`, `similarTo`, `defaultScorer`, attention, interests, dedupe, commit planner — for evals and custom scorers |

**Store:** `upsert(items, { vectors? })`, `remove(ids)`, `reset(items)`, `interact(id, kind?)`, `forget(id)`,
`clearInterests()`, `watch(query)` (ref-counted; hooks do this for you), `setWeights(weights)`, `requestSimilar(id, k)`,
`onEmbedded` / `onQueryEmbedded`, `dispose()`.

**`useSemantic(query, { commit, hysteresis, idleMs })`** returns `beliefs`, `interests`, `pending`, `commit`, `pin`,
`panelProps`, `status`, `model` (download progress), `rankMs`, `itemCount`, `networkRequests`, `query`, `resultQuery`.
While a new query is being ranked, the previous results stay on screen (`resultQuery` tells you which).

## Limits (v0.1)

- In-memory index only (no IndexedDB persistence); a linear scan is fine to ~10k items.
- Confidence is uncalibrated — treat it as a display hint.
- Small embedding models are weak at near-duplicate detection and negation; tune thresholds per dataset.
- transformers.js brings a ~27 MB wasm runtime (6.8 MB gzipped) plus the model download (~23 MB for MiniLM).

See [`examples/`](../../examples) for two complete apps, each with an eval script.
