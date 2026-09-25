# semantic-state

> **Experimental.** A research project: APIs change without notice, it is published only under the `experimental` npm
> tag (`npm install semantic-state@experimental`), and the numbers come from small datasets. Not for production.

React state that is **ranked by meaning instead of looked up by key**, computed on-device in a Web Worker.

```tsx
const { beliefs } = useSemantic<Note>('notes about the launch')
// → [{ value: note, confidence: 0.8, reason: { kind: 'interest', becauseOf: 42 } }, …]
```

- **Subscribe to a relevance query**, not a key. Results are `Belief<T>`: your item, a confidence, and why it's there.
- **Learns from interactions**: one drifting focus (centroid) or several interests at once (multi-interest with lanes).
- **Commit policy**: the list holds still while the user works in it; the new order applies when they pause.
- **On-device**: embeddings via transformers.js in a worker, or precomputed at build time. No server, no LLM, no API key.
- **No second state manager**: keep exact state wherever you already do; this layer only ranks.

→ Library docs and API: [`packages/semantic-state`](packages/semantic-state)

## Examples

| Example | Shows |
|---|---|
| [**Dev inbox**](examples/inbox) | Rules vs `useSemantic("what needs my attention right now")`: centroid attention, a custom scorer with deadlines, near-duplicate folding, a scripted 5-step scenario with precision@5 (rules 0–2/5, semantic 4–5/5 after a few clicks) |
| [**Semantic Pokédex**](examples/pokedex) | Free-text search over 1025 Pokémon, multi-interest clicks with lanes, "similar to" with adjustable weights, build-time vectors |

![Semantic Pokédex](docs/pokedex-search.png)

## Repo layout

```
packages/semantic-state/   the library (private workspace package)
examples/inbox/            dev-inbox demo + eval
examples/pokedex/          Pokédex demo + data build + eval
e2e/                       Playwright tests for both examples
```

## Develop

```bash
npm install
npm run dev:inbox          # or dev:pokedex
npm test                   # library + example unit tests (vitest)
npm run typecheck && npm run lint
npm run e2e                # Playwright against system Chrome, both examples
npm run eval:inbox         # headless evals with real embeddings
npm run eval:pokedex
```

The first page load downloads the embedding model (~23 MB) once; the browser caches it.

## Background

Started as a weekend project on AI context state management: can a semantic layer sit next to ordinary React state?
The first version compared against hand-written rules and against the same algorithm as a Redux selector; that
comparison is written up in the [inbox example](examples/inbox#what-i-learned). An LLM was deliberately left out: item
text would leave the device, and item text is attacker-controlled (prompt injection — the inbox's spam step shows why).
