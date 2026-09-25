import type { RankedItem } from './types.ts'

/** The order the user actually sees, plus the score each item was placed with. */
export interface Committed {
  readonly order: readonly string[]
  readonly scores: ReadonlyMap<string, number>
}

export const EMPTY_COMMITTED: Committed = { order: [], scores: new Map() }

export interface CommitOptions {
  /** Score changes smaller than this keep the previously committed score, so the list does not jitter. */
  readonly hysteresis: number
  /** Items under the cursor / focused / open: they keep their slot. */
  readonly pinned: ReadonlySet<string>
}

export function planCommit(prev: Committed, next: readonly RankedItem[], opts: CommitOptions): Committed {
  const prevIndex = new Map(prev.order.map((id, i) => [id, i]))
  const sticky = new Map(
    next.map((r) => {
      const old = prev.scores.get(r.id)
      return [r.id, old !== undefined && Math.abs(r.score - old) < opts.hysteresis ? old : r.score]
    }),
  )
  const rankOf = (id: string) => prevIndex.get(id) ?? Number.MAX_SAFE_INTEGER
  const isPinned = (id: string) => opts.pinned.has(id) && prevIndex.has(id)

  const free = next
    .map((r) => r.id)
    .filter((id) => !isPinned(id))
    .sort((a, b) => sticky.get(b)! - sticky.get(a)! || rankOf(a) - rankOf(b))

  const pinned = next
    .map((r) => r.id)
    .filter(isPinned)
    .sort((a, b) => rankOf(a) - rankOf(b))

  const order = pinned.reduce<string[]>((acc, id) => {
    const at = Math.min(rankOf(id), acc.length)
    return [...acc.slice(0, at), id, ...acc.slice(at)]
  }, free)

  return { order, scores: sticky }
}

export interface Moves {
  readonly movedUp: number
  readonly added: number
}

export function countMoves(prevOrder: readonly string[], nextOrder: readonly string[]): Moves {
  const prevIndex = new Map(prevOrder.map((id, i) => [id, i]))
  return nextOrder.reduce<Moves>(
    (acc, id, i) => {
      const before = prevIndex.get(id)
      if (before === undefined) return { ...acc, added: acc.added + 1 }
      return i < before ? { ...acc, movedUp: acc.movedUp + 1 } : acc
    },
    { movedUp: 0, added: 0 },
  )
}
