# Changelog

All notable changes to the `semantic-state` package. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
[semver](https://semver.org/) prereleases on the `experimental` npm dist-tag: any release can break the API, and
breaking changes are listed under **Changed** or **Removed**.

## [Unreleased]

### Added

- `SemanticStore.getServerSnapshot()`: the store's initial snapshot, for server rendering and hydration.

### Fixed

- `useSemantic`, `useSimilar` and `useSemanticSnapshot` no longer throw during server rendering (Next.js,
  `renderToString`); they render the initial snapshot and hydrate from it.
  ([#9](https://github.com/jasonli0226/semantic-state/issues/9))

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

[Unreleased]: https://github.com/jasonli0226/semantic-state/compare/v0.1.0-experimental.0...HEAD
[0.1.0-experimental.0]: https://github.com/jasonli0226/semantic-state/releases/tag/v0.1.0-experimental.0
