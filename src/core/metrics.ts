/** Share of the top k ids that are in the relevant set. Divides by k, not by list length. */
export function precisionAtK(ids: readonly string[], relevant: ReadonlySet<string>, k: number): number {
  if (k <= 0) return 0
  const hits = ids.slice(0, k).filter((id) => relevant.has(id)).length
  return hits / k
}
