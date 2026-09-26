/**
 * Builds public/wiki/layout.json: a fixed map position for every article, from a force layout over each
 * article's 5 nearest neighbours (the same neighbours a click shows). Deterministic. Run after build:data.
 *   npm run build:layout -w examples/memory-graph
 */
import { writeFile } from 'node:fs/promises'
import { type Id, similarTo } from 'semantic-state/core'
import { K } from '../src/config.ts'
import { computeMapLayout } from '../src/graph/mapLayout.ts'
import type { Edge } from '../src/graph/useNeighbors.ts'
import { DEFAULT_WEIGHTS } from '../src/types.ts'
import { loadPrebuilt } from './load-prebuilt.ts'

const { articles, features } = await loadPrebuilt()
const input = { items: articles, idOf: (a: (typeof articles)[number]) => a.id, features: (id: Id) => features.get(id), weights: DEFAULT_WEIGHTS }
const edges: Edge[] = articles.flatMap((a) => similarTo(a.id, input, K).map((s) => ({ source: a.id, target: Number(s.id), similarity: s.score })))

const started = performance.now()
const ids = articles.map((a) => a.id)
const positions = computeMapLayout(ids, edges)
await writeFile('public/wiki/layout.json', `${JSON.stringify({ ids, x: ids.map((id) => positions.get(id)!.x), y: ids.map((id) => positions.get(id)!.y) })}\n`)
process.stdout.write(`${ids.length} positions · ${edges.length} edges · layout ${(performance.now() - started).toFixed(0)} ms\n`)
