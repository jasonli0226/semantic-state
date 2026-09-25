import type { VectorLookup } from './types.ts'
import { dot } from './vector.ts'

/**
 * Tuned on the demo dataset with all-MiniLM-L6-v2 (scripts/pairs.ts): the true duplicate pair scores
 * ~0.64, the closest non-duplicate ~0.58. Thin margin — small embedding models are weak at this.
 */
export const DEFAULT_DUPLICATE_THRESHOLD = 0.62
/** Pairwise comparison is O(n²); only the top of the ranking is worth deduplicating. */
export const DEFAULT_DEDUPE_LIMIT = 40

/**
 * Greedy grouping over ids in rank order: the first id of each group is its representative.
 * Only groups of two or more are returned.
 */
export function groupDuplicates(
  orderedIds: readonly string[],
  getVector: VectorLookup,
  threshold = DEFAULT_DUPLICATE_THRESHOLD,
  limit = DEFAULT_DEDUPE_LIMIT,
): string[][] {
  const candidates = orderedIds.slice(0, limit).flatMap((id) => {
    const vec = getVector(id)
    return vec ? [{ id, vec }] : []
  })
  const assigned = new Set<string>()
  const groups: string[][] = []

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
export function collapseDuplicates(order: readonly string[], groups: readonly (readonly string[])[]): string[] {
  const hidden = new Set(groups.flatMap((group) => group.slice(1)))
  return order.filter((id) => !hidden.has(id))
}
