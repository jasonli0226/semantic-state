import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Visual } from './encoding.ts'
import { countChanged, useHeldVisuals } from './useHeldVisuals.ts'

const v = (radius: number): Visual => ({ radius, tone: 'search', ring: 0, why: `r${radius}` })
const IDLE = 2000

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('countChanged', () => {
  it('counts nodes whose drawing changed, ignoring new and removed nodes', () => {
    expect(countChanged(new Map([[1, v(8)], [2, v(8)]]), new Map([[1, v(9)], [3, v(8)]]))).toBe(1)
  })
})

describe('useHeldVisuals', () => {
  it('applies changes at once when the pointer is not on the graph', () => {
    const { result, rerender } = renderHook(({ fresh }) => useHeldVisuals(fresh, IDLE), { initialProps: { fresh: new Map([[1, v(8)]]) } })
    rerender({ fresh: new Map([[1, v(20)]]) })
    expect(result.current.visuals.get(1)?.radius).toBe(20)
    expect(result.current.pending).toBe(0)
  })

  it('holds changes while the pointer is active, then applies them after it rests', () => {
    const { result, rerender } = renderHook(({ fresh }) => useHeldVisuals(fresh, IDLE), { initialProps: { fresh: new Map([[1, v(8)]]) } })
    act(() => result.current.panelProps.onPointerMove())
    rerender({ fresh: new Map([[1, v(20)], [2, v(12)]]) })
    expect(result.current.visuals.get(1)?.radius).toBe(8)
    expect(result.current.visuals.get(2)?.radius).toBe(12)
    expect(result.current.pending).toBe(1)
    act(() => vi.advanceTimersByTime(IDLE))
    expect(result.current.visuals.get(1)?.radius).toBe(20)
    expect(result.current.pending).toBe(0)
  })

  it('settles when the caller passes an equal but new map on every render', () => {
    const { result, rerender } = renderHook(() => useHeldVisuals(new Map([[1, v(8)]]), IDLE))
    rerender()
    expect(result.current.visuals.get(1)?.radius).toBe(8)
    expect(result.current.pending).toBe(0)
  })

  it('never holds the articles passed as always fresh (the one just clicked)', () => {
    const { result, rerender } = renderHook(({ fresh }) => useHeldVisuals(fresh, IDLE, new Set([1])), {
      initialProps: { fresh: new Map([[1, v(8)], [2, v(8)]]) },
    })
    act(() => result.current.panelProps.onPointerMove())
    rerender({ fresh: new Map([[1, v(20)], [2, v(20)]]) })
    expect(result.current.visuals.get(1)?.radius).toBe(20)
    expect(result.current.visuals.get(2)?.radius).toBe(8)
    expect(result.current.pending).toBe(1)
  })

  it('applies held changes as soon as the pointer leaves', () => {
    const { result, rerender } = renderHook(({ fresh }) => useHeldVisuals(fresh, IDLE), { initialProps: { fresh: new Map([[1, v(8)]]) } })
    act(() => result.current.panelProps.onPointerMove())
    rerender({ fresh: new Map([[1, v(20)]]) })
    act(() => result.current.panelProps.onPointerLeave())
    expect(result.current.visuals.get(1)?.radius).toBe(20)
  })
})
