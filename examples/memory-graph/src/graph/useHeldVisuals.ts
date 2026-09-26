import { useActivity } from 'semantic-state/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Visual, sameVisual } from './encoding.ts'

export type Visuals = ReadonlyMap<number, Visual>

/** Nodes present in both maps whose drawing differs. */
export function countChanged(applied: Visuals, fresh: Visuals): number {
  let changed = 0
  for (const [id, visual] of fresh) {
    const old = applied.get(id)
    if (old && !sameVisual(old, visual)) changed += 1
  }
  return changed
}

/**
 * The library's commit policy holds the *order* of beliefs while the user works; their confidence is always
 * fresh. A graph shows values, not order, so this holds the visuals themselves: while the pointer is active
 * over the graph, drawn nodes keep their last applied look (new nodes appear at once); after `idleMs` of rest,
 * or when the pointer leaves, the fresh visuals apply.
 */
export function useHeldVisuals(fresh: Visuals, idleMs: number) {
  const [applied, setApplied] = useState(fresh)
  const [recheck, setRecheck] = useState(0)
  const onLeave = useCallback(() => setRecheck((n) => n + 1), [])
  const { panelProps, quietFor } = useActivity(idleMs, onLeave)
  const pending = useMemo(() => countChanged(applied, fresh), [applied, fresh])

  // Synchronizes with time and pointer activity (refs + timer), which render can't observe.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    if (pending === 0) return void (applied !== fresh && setApplied(fresh))
    const quiet = quietFor()
    // oxlint-disable-next-line react/set-state-in-effect
    if (quiet >= idleMs) return setApplied(fresh)
    const timer = setTimeout(() => setRecheck((n) => n + 1), idleMs - quiet)
    return () => clearTimeout(timer)
  }, [pending, applied, fresh, idleMs, quietFor, recheck])

  const visuals = useMemo(() => new Map([...fresh].map(([id, visual]) => [id, applied.get(id) ?? visual])), [fresh, applied])
  return { visuals: visuals as Visuals, pending, panelProps }
}
