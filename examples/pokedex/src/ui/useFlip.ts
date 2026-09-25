import { type RefObject, useLayoutEffect, useRef } from 'react'

const DURATION_MS = 350

/**
 * FLIP: when the order changes, rows slide from their old position to the new one
 * instead of jumping. Rows must carry `data-id`.
 */
export function useFlip(listRef: RefObject<HTMLElement | null>, orderKey: string) {
  const positions = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const next = new Map<string, number>()

    for (const child of Array.from(list.children) as HTMLElement[]) {
      const id = child.dataset.id
      if (!id) continue
      const top = child.offsetTop
      next.set(id, top)
      const before = positions.current.get(id)
      if (before === undefined || before === top || reduceMotion || !child.animate) continue
      child.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], {
        duration: DURATION_MS,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      })
    }
    positions.current = next
  }, [listRef, orderKey])
}
