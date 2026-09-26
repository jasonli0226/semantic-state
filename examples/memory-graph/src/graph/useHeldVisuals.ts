import { useActivity } from 'semantic-state/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Visual, sameVisual } from './encoding.ts'

export type Visuals = ReadonlyMap<number, Visual>

const NONE: ReadonlySet<number> = new Set()

/** Nodes present in both maps whose drawing differs (ignoring `skip`). */
export function countChanged(applied: Visuals, fresh: Visuals, skip: ReadonlySet<number> = NONE): number {
  let changed = 0
  for (const [id, visual] of fresh) {
    const old = skip.has(id) ? undefined : applied.get(id)
    if (old && !sameVisual(old, visual)) changed += 1
  }
  return changed
}

/**
 * The library's commit policy holds the *order* of beliefs while the user works; their confidence is always
 * fresh. A graph shows values, not order, so this holds the visuals themselves: while the pointer is active
 * over the graph, drawn nodes keep their last applied look (new nodes appear at once); after `idleMs` of rest,
 * or when the pointer leaves, the fresh visuals apply. `alwaysFresh` nodes (the article the user just acted on)
 * are never held: their explanation must describe the click, not the moment before it.
 */
export function useHeldVisuals(fresh: Visuals, idleMs: number, alwaysFresh: ReadonlySet<number> = NONE) {
  const [applied, setApplied] = useState(fresh)
  const [recheck, setRecheck] = useState(0)
  const onLeave = useCallback(() => setRecheck((n) => n + 1), [])
  const { panelProps, quietFor } = useActivity(idleMs, onLeave)
  const pending = useMemo(() => countChanged(applied, fresh, alwaysFresh), [applied, fresh, alwaysFresh])

  // Synchronizes with time and pointer activity (refs + timer), which render can't observe.
  useEffect(() => {
    // Only a new node needs recording (so its look is held from now on). Keying on membership, not map
    // identity, keeps this from looping when the caller builds an equal map on every render.
    // oxlint-disable-next-line react/set-state-in-effect
    if (pending === 0) return void ([...fresh.keys()].some((id) => !applied.has(id)) && setApplied(fresh))
    const quiet = quietFor()
    // oxlint-disable-next-line react/set-state-in-effect
    if (quiet >= idleMs) return setApplied(fresh)
    const timer = setTimeout(() => setRecheck((n) => n + 1), idleMs - quiet)
    return () => clearTimeout(timer)
  }, [pending, applied, fresh, idleMs, quietFor, recheck])

  // Held look only where the drawing would change; otherwise the fresh visual, so the why-text stays current.
  const visuals = useMemo(
    () =>
      new Map(
        [...fresh].map(([id, visual]) => {
          const old = alwaysFresh.has(id) ? undefined : applied.get(id)
          return [id, old && !sameVisual(old, visual) ? old : visual] as const
        }),
      ),
    [fresh, applied, alwaysFresh],
  )
  return { visuals: visuals as Visuals, pending, panelProps }
}
