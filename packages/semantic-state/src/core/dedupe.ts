import type { Id, Vec } from './types.ts'
import { dot } from './vector.ts'

/** A starting point for all-MiniLM-L6-v2; tune per dataset (small models have thin margins here). */
export const DEFAULT_DUPLICATE_THRESHOLD = 0.8
/** Pairwise comparison is O(n²); only the top of the ranking is worth deduplicating. */
export const DEFAULT_DEDUPE_LIMIT = 40

/**
 * Greedy grouping over ids in rank order: the first id of each group is its representative.
 * Only groups of two or more are returned.
 */
export function groupDuplicates<I extends Id>(
  orderedIds: readonly I[],
  getVector: (id: I) => Vec | undefined,
  threshold = DEFAULT_DUPLICATE_THRESHOLD,
  limit = DEFAULT_DEDUPE_LIMIT,
): I[][] {
  const candidates = orderedIds.slice(0, limit).flatMap((id) => {
    const vec = getVector(id)
    return vec ? [{ id, vec }] : []
  })
  const assigned = new Set<I>()
  const groups: I[][] = []

  candidates.forEach((head, i) => {
    if (assigned.has(head.id)) return
    const members = candidates
      .slice(i + 1)
      .filter((other) => !assigned.has(other.id) && dot(head.vec, other.vec) >= threshold)
      .map((other) => other.id)
    if (members.length === 0) return
    const group = [head.id, ...members]
    group.forEach((id) => assigned.add(id))
    groups.push(group)
  })
  return groups
}

/** Drops every non-representative group member from a ranked order. */
export function collapseDuplicates<I extends Id>(order: readonly I[], groups: readonly (readonly I[])[]): I[] {
  const hidden = new Set(groups.flatMap((group) => group.slice(1)))
  return order.filter((id) => !hidden.has(id))
}
