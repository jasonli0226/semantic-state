# Memory graph

**What you click becomes a memory, and the memory changes what matters everywhere.** This example puts about 1000
Wikipedia articles (the [Level 3 vital articles](https://en.wikipedia.org/wiki/Wikipedia:Vital_articles/Level/3))
on one map. Every click teaches [semantic-state](../../packages/semantic-state) what you're interested in. It
re-ranks every article by meaning, on your device, with no server and no LLM, and the map lights up the articles
that are now relevant, even far from where you clicked.

![Memory graph](../../docs/memory-graph.png)

```bash
npm install              # from the repo root, once
npm run dev:graph        # then open the printed localhost URL
```

## Try it (1 minute)

1. **Look.** The map opens on *Moon*, already clicked. Its 5 nearest articles are linked, and related articles across
   the map glow orange: that's Moon's "interest lane".
2. **Click a second topic.** In the side panel's *Nearest articles*, click *Earth*, or click any dot. A second colour
   appears: now two interests rank the map at once, each lighting its own articles.
3. **Watch it hold still.** Move the pointer over the map right after a click. A "N changes pending" chip appears and
   sizes stay put while you work. Move away or rest for 2 s and they update.
4. **Search.** Type `volcanoes and earthquakes` and press Enter. The first search downloads a small model (~23 MB,
   once), then the camera flies to the best match.
5. **Zoom in.** Scroll, pinch or use the **+** button. Labels appear as you get closer, and the detail panel explains why any
   article looks the way it does.
6. **Reset** clears what the map remembers.

## Reading the map

| You see | It means |
|---|---|
| Large dot with a ring | an article you clicked. The ring fades as newer clicks push the interest down. |
| Dot size | how relevant the article is now, from the ranking's `confidence` (8–28 px). Tiny dots aren't in the top 100. |
| Dot colour | *which* of your clicks made it relevant: one colour per interest (a "lane"). The neutral colour means it matches your search. Faint means no strong signal. |
| Lines | the trail: each of your last 5 clicks linked to its 5 nearest articles. Older trails fade. |
| Position | fixed. Similar articles sit near each other, and clicks never move the map. |

**Glossary.**
- **Belief:** one ranked article, with a `confidence` and a `reason` (search or interest).
- **Interest (multi-interest mode):** each click is kept separately, decays as you click more, and gets its own lane,
  so two unrelated clicks don't average into mush.
- **Commit policy:** when the ranking is allowed to change what you see.

See the library's [Concepts](../../packages/semantic-state#concepts) for more.

## How it works

```
build time (committed)                          in the browser
─────────────────────────────                    ───────────────────────────────────────────────────────
scripts/build-wiki.ts                            ArticleSource (src/source.ts)
  Wikipedia API → abstracts                        loads articles + vectors + layout
  → embeddings (transformers.js)                          │
  public/wiki/articles.json, vectors.bin                  ▼
scripts/build-layout.ts                          semantic-state worker (src/memory.worker.ts)
  5-nearest-neighbour graph → force layout         store.upsert(articles, { vectors })
  public/wiki/layout.json                          store.interact(id) on every click
                                                          │
                                                          ▼
                                                 hooks → one SVG map (src/ui/GraphView.tsx)
                                                   useSemantic   → size / colour / ring (every article)
                                                   useNeighbors  → trail lines (requestSimilar per click)
                                                   encode()      → the drawing and the "why" text, from one function
```

A few design choices worth knowing:

- **The map holds still while you work.** The library's commit policy holds a *list's order*, but a map shows
  *values* (size, colour). So `useHeldVisuals` holds those while the pointer is active over the map. The article you
  just clicked is always shown fresh. (Library follow-up: [#23](https://github.com/jasonli0226/semantic-state/issues/23).)
- **Search goes by the text alone.** The worker's ranking blends your query 60/40 with your interests. That's right
  for "what stands out", but it would let an unrelated click weaken or redirect an explicit search. So the jump
  target is the article most similar to the query text. Below 0.3 similarity you get "Only weak matches" instead.
- **Keyboard.** The map is one tab stop. Arrow keys walk the selected article's neighbours, Escape returns, Enter
  explores, and `+` `-` `0` zoom. *Nearest articles* in the side panel is the same graph without the map.
- **Topic weight** blends in a one-hot topic vector. At 0 neighbours are pure meaning; at 1 they stay within their
  topic.
- **Known limit:** while the model downloads for the first search, clicks wait for it ([#25](https://github.com/jasonli0226/semantic-state/issues/25)).

## Scripts

Run from the repo root.

| Command | What it does | Needs |
|---|---|---|
| `npm run dev:graph` | dev server | — |
| `npm run eval:graph` | neighbour quality (10 known pairs), what the E2E search finds, map quality, baseline timings | downloads the model once |
| `npm run build:data -w examples/memory-graph` | rebuilds `public/wiki/` from the Wikipedia API (cached in `node_modules/.cache/wiki`) | network |
| `npm run build:layout -w examples/memory-graph` | rebuilds `layout.json` from the data (deterministic) | run after `build:data` |
| `npm run measure:fps -w examples/memory-graph` | frames per second while panning and zooming | a production build served on port 4175: `npm run build -w examples/memory-graph`, then `npx vite preview --port 4175` in this folder |
| `npx playwright test --project memory-graph` | the E2E tests | Chrome |

## Baseline

Measured on the prebuilt data (1003 articles), for comparing with runtime loading and IndexedDB caching later ([#26](https://github.com/jasonli0226/semantic-state/issues/26)).

| Measure | Where | Value |
|---|---|---|
| Articles + vectors + layout fetched and decoded | dev server (footer) | ~25 ms |
| Ranking all articles in the worker (`rankMs`) | dev server (footer) | ~3–9 ms |
| Neighbours of one article, median | `eval:graph` (Node) | 1.9 ms |
| Neighbour quality | `eval:graph` | 10/10 sources have an expected article in their top 5 |
| Map quality | `eval:graph` | 99.2 % of neighbour links shorter than the median random pair |
| Pan and zoom | production build (`measure:fps`) | 60 fps |

## Licence

Article text is from Wikipedia, licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); see
`public/wiki/LICENSE.md`. Code is MIT.
