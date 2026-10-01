# Roadmap

semantic-state is an experimental prerelease (`0.1.0-experimental.1`). This is the direction, not a promise; each item
links to an issue where the details and progress live. Suggestions welcome — open an issue.

## Now — make 0.1.x usable

| Item | Issue |
|---|---|
| Announce reorders to screen readers; keep focus stable when the list reorders | [#8](https://github.com/jasonli0226/semantic-state/issues/8) |
| Hold belief values (confidence, reason), not just order, under the commit policy | [#23](https://github.com/jasonli0226/semantic-state/issues/23) |
| Memory graph: deferred polish from the #22 reviews | [#27](https://github.com/jasonli0226/semantic-state/issues/27) |

## Next — 0.2

| Item | Issue |
|---|---|
| Approximate nearest-neighbour index for collections beyond ~10k items | [#11](https://github.com/jasonli0226/semantic-state/issues/11) |
| Embedder options: WebGPU, and bring-your-own (server) embedders | [#12](https://github.com/jasonli0226/semantic-state/issues/12) |
| Calibrate `Belief.confidence` | [#13](https://github.com/jasonli0226/semantic-state/issues/13) |
| Cache query vectors in IndexedDB, opt-in, so a reload skips the model | [#34](https://github.com/jasonli0226/semantic-state/issues/34) |
| Memory graph: live Wikipedia source and IndexedDB cache, measured against the baseline | [#26](https://github.com/jasonli0226/semantic-state/issues/26) |

## Later — exploring

| Item | Issue |
|---|---|
| Optional LLM re-ranking, opt-in, with prompt-injection guardrails | [#14](https://github.com/jasonli0226/semantic-state/issues/14) |
| Better duplicate and negation handling | [#15](https://github.com/jasonli0226/semantic-state/issues/15) |
| API review and a stable `0.1.0` | [#16](https://github.com/jasonli0226/semantic-state/issues/16) |

## Done

| Item | Issue |
|---|---|
| CI: typecheck, lint, unit tests and E2E on every PR | [#5](https://github.com/jasonli0226/semantic-state/issues/5) |
| CI: pack-and-install smoke test for the published package | [#6](https://github.com/jasonli0226/semantic-state/issues/6) |
| CHANGELOG and release checklist | [#7](https://github.com/jasonli0226/semantic-state/issues/7) |
| Persist item vectors in IndexedDB | [#10](https://github.com/jasonli0226/semantic-state/issues/10) |

## Not planned

- **A general state manager.** semantic-state ranks; exact state (forms, selection, carts) stays in whatever you use today.
- **Sending item text to a server by default.** On-device is the point; server embedders will stay opt-in (#12).

Current limits are listed in the [library README](packages/semantic-state#limits-v01).
