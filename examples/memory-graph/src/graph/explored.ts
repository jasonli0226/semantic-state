import { type Vec, dot } from 'semantic-state/core'

/**
 * Every article is always on the map. What the user explored is the click history (oldest first); the last few
 * clicks keep their neighbour edges drawn — the trail.
 */

export type ExpandedOrder = readonly number[]
export type NeighbourMap = ReadonlyMap<number, readonly number[]>

export const expand = (order: ExpandedOrder, id: number): ExpandedOrder => [...order.filter((x) => x !== id), id]

/** The last `n` expansions, oldest first. */
export const trail = (order: ExpandedOrder, n: number): ExpandedOrder => order.slice(-n)

export type SearchSeed = { readonly kind: 'seed'; readonly id: number; readonly similarity: number } | { readonly kind: 'weak' }

/**
 * The article whose text best matches the query itself. Deliberately not the worker's ranking: that blends
 * in the user's interests (60/40), so an unrelated click would weaken — and even change — an explicit search.
 */
export function pickSearchSeed(queryVec: Vec, vectors: ReadonlyMap<number, Vec>, minSimilarity: number): SearchSeed {
  let best: { id: number; similarity: number } | null = null
  for (const [id, vector] of vectors) {
    const similarity = dot(queryVec, vector)
    if (!best || similarity > best.similarity) best = { id, similarity }
  }
  return best && best.similarity >= minSimilarity ? { kind: 'seed', ...best } : { kind: 'weak' }
}
