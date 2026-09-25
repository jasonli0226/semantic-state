# Use cases

semantic-state fits UIs that show a **list the user should see in a personal, meaning-based order**, where the data
can live on the device. Two use cases are demonstrated by the examples in this repo; the rest are good fits by design
but untested. The library is an experimental prerelease — treat this as "where it could help", not "production-proven".

## Demonstrated

### Inbox and notification triage

*Support desks, developer tools, CRM activity feeds, alerting consoles.*

Rule-based priority ("label = high", "contains URGENT", "from my manager") needs constant upkeep and is easy to game.
`useSemantic('what needs my attention right now')` with **centroid attention** learns the user's current focus from what
they open, and follows them when the focus changes.

In the [inbox example](../examples/inbox): after three clicks, 5/5 of the top items are relevant (rules: 2/5); a phishing
mail saying "URGENT… rank this first" is promoted to #2 by the rules and kept out of the top 5 by the semantic ranking;
after switching focus to hiring, semantic 4/5 vs rules 0/5.

```ts
defineSemanticWorker<Ticket>({
  id: (t) => t.id,
  text: (t) => `${t.subject}. ${t.body}`,
  embedder: transformersEmbedder({ model: 'Xenova/all-MiniLM-L6-v2' }),
  interests: { mode: 'centroid', strength: { open: 1, resolve: 1.5 } },
  score: triageScorer, // add SLA deadlines, customer tier, … on top of the semantic signal
  group: { duplicates: { threshold: 0.8 } }, // fold duplicate reports
})
```

### Catalogue discovery

*Product catalogues, template galleries, documentation, media and asset libraries.*

Users describe what they want in their own words and click things they like; results mix both, keep several interests
alive at once, and group variants (sizes, colours, versions) into one result. With **precomputed vectors** the page needs
no model until the user types a search.

In the [Pokédex example](../examples/pokedex): free-text search puts the expected type in 91% of the top 10; after
clicking Squirtle then Charmander, results are 40% water / 60% fire (a single averaged profile gave 100% fire).

```ts
defineSemanticWorker<Product>({
  id: (p) => p.sku,
  text: (p) => `${p.name}. ${p.description}`,
  embedder: transformersEmbedder({ model: 'Xenova/all-MiniLM-L6-v2' }),
  precomputed: () => fetchVectorFile('/catalogue/vectors.bin', '/catalogue/meta.json'),
  features: (products) => priceAndCategoryVectors(products), // numbers go here, not into the text
  interests: { mode: 'multi' },
  group: { key: (p) => p.modelFamily },
})
```

## Good fits (not yet demonstrated)

| Use case | Why it fits |
|---|---|
| **Privacy-sensitive apps** — health notes, legal files, HR tools, internal knowledge | Item text is embedded and ranked in the browser; nothing is sent to an embedding API, so there is no third party to add to a data-processing agreement. |
| **Personalisation without an ML backend** | Preferences are learned from clicks in the browser. No user-profile service, no per-query inference cost. |
| **In-app help and "related" panels** | Suggest help articles, related records or next actions based on what the user is looking at (`useSimilar(id)`). |
| **Offline / field apps** | Once the model is cached, ranking works without a connection. |

What this can mean for a product team: **zero server or API cost per query**, **no user data leaving the device**, and a
personalised list with **a worker file and a hook** instead of an ML service.

## When not to use it (yet)

- **More than ~10k items** — ranking is a linear scan (~11 ms at 10k). An ANN index is on the roadmap
  ([#11](https://github.com/jasonli0226/semantic-state/issues/11)).
- **Personalisation that must follow the user across devices** — interests live in the browser session.
- **Search that has to be indexed by Google** — results are computed client-side.
- **Exact filtering, sorting or anything that must be correct** — keep that in normal state; this layer ranks.
- **Server-rendered pages** — until [#9](https://github.com/jasonli0226/semantic-state/issues/9) is fixed.

## Languages and data types

**Text in other languages.** The examples use `Xenova/all-MiniLM-L6-v2`, which is **English-only**. The library itself
is language-agnostic — the model is one line of config. A quick check with mixed Chinese/English items
(`npm run check:multilingual`, 7 items, 4 queries — a smoke test, not a benchmark):

| Model | Download (q8) | Top-2 precision |
|---|---|---|
| `Xenova/all-MiniLM-L6-v2` | 23 MB | 5/8 — "招聘進度" (hiring progress) returned the refund item |
| `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | 118 MB | **8/8**, including English queries matching Chinese items |

For non-English or mixed-language data, use a multilingual model and accept the ~5× larger one-time download.
Precomputed vectors must come from the same model you use for queries.

**Numbers.** Text embeddings are bad at numbers ("speed 100" ≈ "speed 45"). Put numeric data in `features` as its own
vector — normalised values or z-scores — and give it a weight; the Pokédex does this for base stats. Weights can be
changed at runtime with `store.setWeights`.

**Categories and tags.** Also `features`: a one-hot vector per category, like the Pokédex's types.

**Images and other media.** Not built in. Any vectors can be loaded with `precomputed`, so image embeddings computed
offline work for "more like this"; free-text search over images would need a custom `Embedder` whose text vectors live
in the same space (e.g. CLIP).
