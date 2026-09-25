import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RankedItem } from '../core/types.ts'
import { useCommitPolicy } from './useCommitPolicy.ts'

const r = (id: string, score: number): RankedItem => ({ id, score, confidence: 1, source: 'semantic' })
const first = [r('a', 0.9), r('b', 0.5)]
const flipped = [r('a', 0.1), r('b', 0.9)]
const ids = (rows: readonly RankedItem[]) => rows.map((row) => row.id)

function setup(policy: 'onIdle' | 'manual' | 'live') {
  return renderHook(({ ranked }) => useCommitPolicy(ranked, { policy, hysteresis: 0.05, idleMs: 1000 }), {
    initialProps: { ranked: first },
  })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useCommitPolicy', () => {
  it('commits the first ranking immediately under every policy', () => {
    for (const policy of ['onIdle', 'manual', 'live'] as const) {
      expect(ids(setup(policy).result.current.visible)).toEqual(['a', 'b'])
    }
  })

  it('live: applies a new ranking at once', () => {
    const { result, rerender } = setup('live')
    rerender({ ranked: flipped })
    expect(ids(result.current.visible)).toEqual(['b', 'a'])
  })

  it('manual: holds the order and reports pending moves until commit()', () => {
    const { result, rerender } = setup('manual')
    rerender({ ranked: flipped })
    expect(ids(result.current.visible)).toEqual(['a', 'b'])
    expect(result.current.pending).toEqual({ movedUp: 1, added: 0 })
    act(() => result.current.commit())
    expect(ids(result.current.visible)).toEqual(['b', 'a'])
    expect(result.current.pending).toEqual({ movedUp: 0, added: 0 })
  })

  it('onIdle: waits while the user is active in the panel, then commits', () => {
    const { result, rerender } = setup('onIdle')
    act(() => result.current.panelProps.onPointerMove())
    rerender({ ranked: flipped })
    expect(ids(result.current.visible)).toEqual(['a', 'b'])
    act(() => void vi.advanceTimersByTime(500))
    act(() => result.current.panelProps.onPointerMove())
    act(() => void vi.advanceTimersByTime(700))
    expect(ids(result.current.visible)).toEqual(['a', 'b'])
    act(() => void vi.advanceTimersByTime(400))
    expect(ids(result.current.visible)).toEqual(['b', 'a'])
  })

  it('onIdle: commits as soon as the pointer leaves the panel', () => {
    const { result, rerender } = setup('onIdle')
    act(() => result.current.panelProps.onPointerMove())
    rerender({ ranked: flipped })
    act(() => result.current.panelProps.onPointerLeave())
    expect(ids(result.current.visible)).toEqual(['b', 'a'])
  })

  it('onIdle: commits right away when the user is not in the panel', () => {
    const { result, rerender } = setup('onIdle')
    rerender({ ranked: flipped })
    expect(ids(result.current.visible)).toEqual(['b', 'a'])
  })

  it('keeps the hovered item in its slot', () => {
    const { result, rerender } = setup('live')
    act(() => result.current.pin('a'))
    rerender({ ranked: [r('a', 0.1), r('b', 0.9)] })
    expect(ids(result.current.visible)).toEqual(['a', 'b'])
  })

  it('drops removed items immediately, even in manual mode', () => {
    const { result, rerender } = setup('manual')
    rerender({ ranked: [r('b', 0.5)] })
    expect(ids(result.current.visible)).toEqual(['b'])
  })

  it('shows the latest scores without reordering', () => {
    const { result, rerender } = setup('manual')
    rerender({ ranked: flipped })
    expect(result.current.visible.map((row) => row.score)).toEqual([0.1, 0.9])
  })
})
