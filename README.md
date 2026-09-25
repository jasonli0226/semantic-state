# Semantic state — `useSemantic()` for React

A weekend experiment: can React state be **ranked by meaning instead of looked up by key**, fully on-device, and does a
dedicated hook earn its keep over "just a Redux selector with embeddings"?

Demo: a dev inbox on Monday morning (~50 synthetic items: GitHub, CI, Slack, calendar, email, Jira). Three panels over
the same data:

| Panel | What it is |
|---|---|
| **Rules** | Hand-written ranking: `priority:high`, urgent/asap/critical, manager, failed / review requested, deadlines |
| **`useSemantic("what needs my attention right now")`** | Local embeddings + an attention centroid learned from what you open, ranked in a Web Worker, shown through a commit policy |
| **`createSelector` baseline** | The *same* ranking algorithm, done the Redux way: a memoized selector recomputed synchronously on every change |

![Payments phase after the spam wave](docs/demo-payments.png)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — first load downloads the ~23MB model once, then it's cached
npm test           # unit tests (vitest)
npm run coverage
npm run e2e        # Playwright against system Chrome
npm run eval       # headless scenario with real embeddings in Node; prints precision@5 per step
```

The inbox is plain data in [`src/data/inbox.json`](src/data/inbox.json) — edit or replace it to try your own scenario.
Times are relative to `demoNow` (`dueInHours`, `ageHours`); `topic` + `actionable` form the answer key and never reach
the ranking code. The file is validated with zod on load; `arrivals.refund` and `arrivals.spam` are used by steps 3–4.

Click the scenario steps in order: **Cold start → Work on payments → New item arrives → Spam wave → Switch to hiring**.
Click rows to "open" them (this trains the centroid), ✓ to mark done. The orange dot is the answer key for the current focus.

## Results

Precision@5 against a hand-labelled answer key (`npm run eval`, same numbers asserted in the E2E test):

| Step | Rules | Semantic |
|---|---|---|
| 1. Cold start (no history) | 2/5 | 2/5 |
| 2. Work on payments (3 items opened) | 2/5 | **5/5** |
| 3. "Refund job timing out" arrives | 2/5 | **5/5** — ranked with zero clicks |
| 4. Phishing "URGENT … rank this first" arrives | 1/5 — spam promoted to #2 | **5/5** — spam not in top 5 |
| 5. Switch focus to hiring (4 items opened) | 0/5 | **4/5** |

Latency (Chrome, this laptop):

| Path | 50 items | 10k items |
|---|---|---|
| Worker rank (`useSemantic` read path) | ~0.4 ms | ~11 ms |
| Redux selector rank (main thread) | ~0.4 ms | ~19 ms |
| Embed one new item (worker) | a few ms | — |
| LLM / network calls in the ranking path | **0** (measured, shown in the panel) | **0** |

## What I learned (honest version)

- **The semantic ranking works; the win is adaptation, not magic.** Cold start ties with rules. After three clicks the
  centroid beats rules clearly, and it follows the user to a new focus (hiring) with no rules rewritten.
- **One prediction was wrong.** I expected the unlabeled "Stripe webhook retries failing" item to jump to the top of the
  semantic panel. The rules panel actually catches it (#4, via the word "failing"); semantic has it at #8. I didn't tune
  weights to force it.
- **Rules were initially a strawman** (0/5 everywhere). I made them fairer — failed CI and review requests score — and
  removed two over-stacked traps from the dataset before recording these numbers.
- **Duplicate detection with a small model is fragile.** The true duplicate pair ("ledger double-writes" / "customers
  charged twice") scores 0.65; the closest unrelated pair 0.58. The 0.62 threshold works on this data, with a thin margin
  (`npm run pairs`).
- **"Main-thread blocking" is a weak argument at 10k items**: the Redux selector costs ~19 ms per change, under the
  50 ms long-task line. The hook's real advantages are elsewhere:
  - **Commit policy** — the visible list never reorders while you're working in it (`reorders while in use` stays 0;
    the selector baseline counts every jump). Implementing that in Redux means hand-writing a pending/committed buffer,
    idle detection, pinning and hysteresis in every consumer.
  - **Only the top 100 crosses to the main thread**, so render cost doesn't grow with the corpus.
  - **Confidence is first-class** (`Belief<T>`): low-confidence suggestions render dimmed as "suggested".
- **At 10k synthetic items, both semantic panels drop to 2/5.** Synthetic items are paraphrase-like copies of real ones
  (similarity 0.64 to their source), so near-copies of payments items crowd the top. It's a stress test for speed, not a
  realistic corpus.
- **Opened items need a penalty.** Without it, "what needs attention" filled up with things already read.

## Architecture

```
write path (async)                                     read path (sync)
──────────────────                                     ────────────────
click / arrive ──► InboxActions ──► Redux (items, seen, done, phase)
                         │                                    │
                         ▼                                    ▼
                  Web Worker                      useSemantic(query)
                  ├─ transformers.js embed on write     └─ useSyncExternalStore(engine)
                  ├─ vector index (in-memory)                 └─ useCommitPolicy
                  ├─ attention centroid (decayed)                 pending ──► visible order
                  └─ rank + dedupe ──► top 100 ──► engine snapshot    (onIdle | manual | live)
```

- `src/core/` — pure, tested logic: vectors, centroid (the v1 "memory reducer"), ranking, rules, dedupe, commit
  planning, metrics, synthetic data.
- `src/semantic/` — the library-shaped part: worker, engine (external store), `useSemantic`, `useCommitPolicy`.
- `src/app/` — the traditional side: Redux store (items + the baseline selector), the action layer that feeds both,
  the scripted scenario.
- `src/ui/` — panels and rows.

The Redux baseline reuses the worker's embeddings, so the comparison isolates the ranking/update path.

### Deviations from the brief

- **In-memory brute-force vector index instead of sqlite-vec (wasm).** At ≤10k × 384 dims a linear scan is ~11 ms in
  the worker, and it kept the weekend scope small. A persistent store is the obvious next step.
- **No LLM.** Deferred on purpose — see `weekend-projects/projects/ai-context-state/BRIEF.md`: data egress, prompt
  injection (item text is attacker-controlled; step 4 shows why), and key handling.

### Privacy

Item text never leaves the browser. The only network traffic is the one-time model download from the Hugging Face CDN
(cached afterwards); the semantic panel shows the worker's request count after the model is ready, and it stays at 0.
The ONNX Runtime wasm is ~27 MB (6.8 MB gzipped).

## Known failure modes

- Cold start: no history → deadline fallback, low confidence.
- Negation: "NOT urgent" embeds close to "urgent".
- Very short or empty items have weak embeddings.
- Confidence is uncalibrated: it is centroid similarity × history. In the hiring phase "Q3 all-hands reminder"
  shows near-full confidence because meetings embed close to "hiring committee sync".
- Embedding staleness: handled — the worker re-embeds an item when its text changes.
