# Changelog

All notable changes to the `semantic-state` package. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
[semver](https://semver.org/) prereleases on the `experimental` npm dist-tag: any release can break the API, and
breaking changes are listed under **Changed** or **Removed**.

## [Unreleased]

### Added

- Background item embedding: items without vectors are embedded in batches (`embedBatchSize`, default 32) and the
  worker handles other messages between batches. Results rank the items embedded so far, and progress arrives as
  `embedProgress` → `snapshot.embedding` → `useSemantic().embedding` (`{ done, total } | null`).
  ([#31](https://github.com/jasonli0226/semantic-state/issues/31))
- Vector cache: `defineSemanticWorker({ vectorCache: indexedDbVectorCache({ model }) })` keeps item vectors in
  IndexedDB, so a reload embeds only new or edited items. `clearVectorCache()` (root entry) deletes it, e.g. on
  logout after `store.dispose()`. With `emitVectors`, cache hits are posted as `embedded` with `cached: true`.
  ([#10](https://github.com/jasonli0226/semantic-state/issues/10))

### Changed

- `upsert` and `reset` no longer hold other messages until every item is embedded, and an upsert that needs
  embedding is ranked once its first batch is done. With `emitVectors`, `embedded` is posted once per batch.
- While items are first being embedded, `useSemantic` applies the commit policy without hysteresis, then commits
  the first ranking made with every item embedded once, whatever the policy, so the first load never stays on a
  partial ranking.

### Fixed

- Clicks, similar-item requests and weight changes no longer wait for a search query's embedding. The worker
  embeds queries outside its message queue, so a slow or hung model download holds up only that query's results;
  the query is ranked, in order, once its vector arrives. ([#25](https://github.com/jasonli0226/semantic-state/issues/25))

## [0.1.0-experimental.1] - 2026-09-27

### Added

- `SemanticStore.getServerSnapshot()`: the store's initial snapshot, for server rendering and hydration.

### Fixed

- `useSemantic`, `useSimilar` and `useSemanticSnapshot` no longer throw during server rendering (Next.js,
  `renderToString`); they render the initial snapshot and hydrate from it.
  ([#9](https://github.com/jasonli0226/semantic-state/issues/9))
- `useSemantic` returns the same empty `interests` array on every render before the first result, instead of a new
  one each time, so memos and effects that depend on it no longer re-run on every render.
  ([#24](https://github.com/jasonli0226/semantic-state/issues/24))

## [0.1.0-experimental.0] - 2026-09-25

First published prerelease.

### Added

- `createSemanticStore(worker)`: main-thread store with `upsert`, `remove`, `reset`, `interact`, `forget`,
  `clearInterests`, `watch`, `setWeights`, `requestSimilar` and `dispose`.
- React bindings (`semantic-state/react`): `SemanticProvider`, `useSemantic`, `useSimilar`, `useSemanticSnapshot`,
  `useSemanticStore`, `useCommitPolicy`, `useActivity`.
- Worker runtime (`semantic-state/worker`): `defineSemanticWorker`, `createWorkerRuntime`, and
  `fetchVectorFile` / `decodeVectorFile` for precomputed vectors.
- On-device embeddings with transformers.js (`semantic-state/transformers`): `transformersEmbedder`.
- Pure ranking functions (`semantic-state/core`): scoring, `centroid` and `multi` attention, interest lanes,
  near-duplicate grouping and the commit planner.
- Commit policies `onIdle`, `manual` and `live`, with hysteresis.

[Unreleased]: https://github.com/jasonli0226/semantic-state/compare/v0.1.0-experimental.1...HEAD
[0.1.0-experimental.1]: https://github.com/jasonli0226/semantic-state/compare/v0.1.0-experimental.0...v0.1.0-experimental.1
[0.1.0-experimental.0]: https://github.com/jasonli0226/semantic-state/releases/tag/v0.1.0-experimental.0
