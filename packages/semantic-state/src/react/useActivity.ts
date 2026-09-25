import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Tracks whether the user is actively working inside a panel (pointer / keyboard / wheel),
 * without re-rendering on every mouse move.
 */
export function useActivity(idleMs: number, onLeave?: () => void) {
  const inside = useRef(false)
  const lastActivity = useRef(0)

  const mark = useCallback(() => {
    inside.current = true
    lastActivity.current = Date.now()
  }, [])

  const isActive = useCallback(() => inside.current && Date.now() - lastActivity.current < idleMs, [idleMs])
  const quietFor = useCallback(() => (inside.current ? Date.now() - lastActivity.current : Number.POSITIVE_INFINITY), [])

  const panelProps = useMemo(
    () => ({
      onPointerEnter: mark,
      onPointerMove: mark,
      onPointerDown: mark,
      onKeyDown: mark,
      onWheel: mark,
      onPointerLeave: () => {
        inside.current = false
        onLeave?.()
      },
    }),
    [mark, onLeave],
  )

  return { panelProps, isActive, quietFor }
}

/** Counts how often a list's order changed while the user was working in it (the jitter metric). */
export function useReorderCount(order: readonly string[], isActive: () => boolean): number {
  const key = order.join('|')
  const previous = useRef(key)
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (previous.current === key) return
    previous.current = key
    // Activity lives in refs (no re-render per mouse move), so this can't be derived during render.
    // oxlint-disable-next-line react/set-state-in-effect
    if (isActive()) setCount((n) => n + 1)
  }, [key, isActive])
  return count
}
