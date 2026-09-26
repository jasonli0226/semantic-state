import type { Id, Reason } from 'semantic-state'

/**
 * What's on screen is derived, not stored: the ids the user expanded (oldest first) plus each one's
 * neighbours. Collapsing the oldest expansion is how the graph "forgets" beyond the node cap.
 */

export type ExpandedOrder = readonly number[]
export type NeighbourMap = ReadonlyMap<number, readonly number[]>

export interface VisibleNode {
  readonly id: number
  /** The expanded node that brought this one on screen (null for expanded roots). New nodes spawn next to it. */
  readonly parent: number | null
}

export const expand = (order: ExpandedOrder, id: number): ExpandedOrder => [...order.filter((x) => x !== id), id]

export function visibleNodes(order: ExpandedOrder, neighboursOf: NeighbourMap): VisibleNode[] {
  const nodes = new Map<number, VisibleNode>()
  for (const id of order) {
    if (!nodes.has(id)) nodes.set(id, { id, parent: null })
    for (const neighbour of neighboursOf.get(id) ?? []) {
      if (!nodes.has(neighbour)) nodes.set(neighbour, { id: neighbour, parent: id })
    }
  }
  return [...nodes.values()]
}

/** Drops the oldest expansions until at most `cap` nodes are visible; the latest expansion always stays. */
export function enforceCap(order: ExpandedOrder, neighboursOf: NeighbourMap, cap: number): ExpandedOrder {
  let kept = order
  while (kept.length > 1 && visibleNodes(kept, neighboursOf).length > cap) kept = kept.slice(1)
  return kept
}

export type SearchSeed = { readonly kind: 'seed'; readonly id: number } | { readonly kind: 'weak' }

interface RankedRow {
  readonly id: Id
  readonly confidence: number
  readonly reason: Reason
}

/** The best row that matched the query itself (not an interest), if it's confident enough. */
export function pickSearchSeed(rows: readonly RankedRow[], minConfidence: number): SearchSeed {
  const top = rows.find((r) => r.reason.kind === 'search')
  return top && top.confidence >= minConfidence ? { kind: 'seed', id: Number(top.id) } : { kind: 'weak' }
}
