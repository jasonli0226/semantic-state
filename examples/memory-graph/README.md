# Memory graph

Explore ~1000 Wikipedia articles (the [Level 3 vital articles](https://en.wikipedia.org/wiki/Wikipedia:Vital_articles/Level/3))
on one map. Click an article: related articles light up across the whole map, and its 5 nearest neighbours are
linked. Your last 5 clicks stay linked as a fading trail. Scroll or pinch to zoom; labels appear as you get closer.

![Memory graph](../../docs/memory-graph.png)

```bash
npm run dev:graph        # from the repo root
npm run eval:graph       # neighbour quality + baseline timings
```

## What you're looking at

Three layers:

| Layer | Drawn as | Comes from |
|---|---|---|
| **Map** | every article at a fixed position; neighbours sit close together | `scripts/build-layout.ts`: a force layout over each article's 5 nearest neighbours, computed once and committed (`public/wiki/layout.json`) |
| **Trail** | edges from your last 5 clicks to their neighbours, fading with age | `store.requestSimilar(id, 5)` per clicked article (`useNeighbors`) |
| **Attention** | size, colour, ring on every article | `useSemantic(query)` in multi-interest mode, top 100 |

| Visual | Meaning |
|---|---|
| Large node with a ring | an article you clicked; the ring fades as the interest decays |
| Node size | `confidence` of the belief (8–28 px); unranked articles are 3 px dots |
| Colour | which click made it relevant (one colour per interest lane); dark grey = matches your search; light grey = no strong signal |
| Edge | nearest-neighbour link; wider = more similar |

The detail panel prints the same explanation the node is drawn from (`src/graph/encoding.ts`).

**The graph holds still while you work in it.** The library's commit policy holds a list's *order*; a graph shows
*values*, so `useHeldVisuals` holds sizes and colours while the pointer is active and applies them when it rests or
leaves ("N changes pending").

**Search jumps to the best match for the text itself.** The worker's ranking blends the query with your interests
(60/40), which is right for "what stands out" but would let an unrelated click weaken or redirect an explicit search.
So the search seed is chosen by query-to-article similarity alone (the worker sends query vectors with
`emitVectors`); below 0.3 you get "Only weak matches" instead of a jump.

**Keyboard.** The map is one tab stop (the selected article). Arrow keys walk its neighbours, Escape returns,
Enter explores, `+` `-` `0` zoom. The detail panel's "Nearest articles" list is the same graph without the map.

**Topic weight** blends a one-hot topic vector into similarity: at 0 neighbours are pure meaning, at 1 they stay
within their topic.

## Data

`public/wiki/` is built by `npm run build:data -w examples/memory-graph && npm run build:layout -w examples/memory-graph` from the MediaWiki API and committed.
Vectors are computed at build time, so the page loads no model until you search.

Loading goes through `ArticleSource` (`src/source.ts`), and vectors reach the worker with
`store.upsert(articles, { vectors })`. Only the prebuilt source exists today; a live Wikipedia source (the worker
embeds on load) plus IndexedDB caching is a planned follow-up, measured against this baseline:

| Baseline (prebuilt, local dev server) | |
|---|---|
| Articles + vectors fetched and decoded in the browser | 25 ms |
| Ranking all 1003 articles in the worker (`rankMs`) | 8.7 ms |
| Neighbours of one article (`eval:graph`, median) | 1.9 ms |
| Neighbour quality (`eval:graph`) | 10/10 sources have an expected article in their top 5 |
| Map quality (`eval:graph`) | 99.2 % of neighbour edges shorter than the median random pair |
| Pan and zoom, production build (`measure:fps`) | 60 fps |

## Licence

Article text is from Wikipedia, licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); see
`public/wiki/LICENSE.md`. Code is MIT.
