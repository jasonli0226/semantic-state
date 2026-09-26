import { type Weights, similarKey } from 'semantic-state'
import { useSemanticSnapshot, useSemanticStore } from 'semantic-state/react'
import { useEffect, useMemo, useRef } from 'react'
import type { Article } from '../types.ts'
import type { NeighbourMap } from './explored.ts'

export interface Edge {
  readonly source: number
  readonly target: number
  readonly similarity: number
}

/**
 * Nearest neighbours of many articles at once (useSimilar covers one). Candidate for the library if other
 * apps need it: batching, and re-requesting only what the current weights haven't answered yet.
 */
export function useNeighbors(ids: readonly number[], k: number): { neighboursOf: NeighbourMap; edges: readonly Edge[] } {
  const store = useSemanticStore<Article>()
  const { status, weights, similar } = useSemanticSnapshot<Article>()
  const requested = useRef<{ weights: Weights | null; ids: ReadonlySet<number> }>({ weights: null, ids: new Set() })

  useEffect(() => {
    if (status !== 'ready') return
    const done = requested.current.weights === weights ? requested.current.ids : new Set<number>()
    const missing = ids.filter((id) => !done.has(id))
    requested.current = { weights, ids: new Set([...done, ...missing]) }
    for (const id of missing) store.requestSimilar(id, k)
  }, [store, status, weights, ids, k])

  return useMemo(() => {
    const neighboursOf = new Map<number, readonly number[]>()
    const strongest = new Map<string, Edge>()
    for (const id of ids) {
      const rows = similar[similarKey(id, k)] ?? []
      neighboursOf.set(id, rows.map((r) => Number(r.id)))
      for (const r of rows) {
        const target = Number(r.id)
        const key = id < target ? `${id}-${target}` : `${target}-${id}`
        const current = strongest.get(key)
        if (!current || r.score > current.similarity) strongest.set(key, { source: id, target, similarity: r.score })
      }
    }
    return { neighboursOf, edges: [...strongest.values()] }
  }, [ids, similar, k])
}
