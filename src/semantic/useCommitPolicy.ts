import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Committed, EMPTY_COMMITTED, type Moves, countMoves, planCommit } from '../core/commit.ts'
import type { RankedItem } from '../core/types.ts'
import type { CommitPolicy } from './config.ts'
import { useActivity, useReorderCount } from './useActivity.ts'

export interface CommitPolicyOptions {
  readonly policy: CommitPolicy
  readonly hysteresis: number
  readonly idleMs: number
}

const NO_PIN: ReadonlySet<string> = new Set()
const sameOrder = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i])

/**
 * Separates the ranking the engine computed (always fresh) from the order the user sees.
 * The visible order only changes when the commit policy says it is safe.
 */
export function useCommitPolicy(ranked: readonly RankedItem[], { policy, hysteresis, idleMs }: CommitPolicyOptions) {
  const [committed, setCommitted] = useState<Committed>(() => planCommit(EMPTY_COMMITTED, ranked, { hysteresis, pinned: NO_PIN }))
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [recheck, setRecheck] = useState(0)
  const onLeave = useCallback(() => {
    setPinnedId(null)
    setRecheck((n) => n + 1)
  }, [])
  const { panelProps, isActive, quietFor } = useActivity(idleMs, onLeave)

  const pinned = useMemo(() => (pinnedId ? new Set([pinnedId]) : NO_PIN), [pinnedId])
  const byId = useMemo(() => new Map(ranked.map((r) => [r.id, r])), [ranked])
  const visible = useMemo(() => committed.order.flatMap((id) => byId.get(id) ?? []), [committed, byId])
  const visibleIds = useMemo(() => visible.map((r) => r.id), [visible])
  const proposal = useMemo(() => planCommit(committed, ranked, { hysteresis, pinned }), [committed, ranked, hysteresis, pinned])
  const changed = !sameOrder(visibleIds, proposal.order)

  // Synchronizes with time and pointer activity (refs + timer), which render can't observe.
  useEffect(() => {
    if (!changed) return
    // oxlint-disable-next-line react/set-state-in-effect
    if (committed.order.length === 0 || policy === 'live') return setCommitted(proposal)
    if (policy === 'manual') return
    const quiet = quietFor()
    if (quiet >= idleMs) return setCommitted(proposal)
    const timer = setTimeout(() => setRecheck((n) => n + 1), idleMs - quiet)
    return () => clearTimeout(timer)
  }, [changed, proposal, committed.order.length, policy, idleMs, quietFor, recheck])

  const pending: Moves = useMemo(() => countMoves(visibleIds, proposal.order), [visibleIds, proposal])
  const commit = useCallback(() => setCommitted(proposal), [proposal])
  const reordersDuringInteraction = useReorderCount(visibleIds, isActive)

  return { visible, pending, commit, pin: setPinnedId, panelProps, reordersDuringInteraction }
}
