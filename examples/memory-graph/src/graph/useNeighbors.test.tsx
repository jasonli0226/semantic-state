import { act, renderHook } from '@testing-library/react'
import { type WorkerLike, createSemanticStore } from 'semantic-state'
import { SemanticProvider } from 'semantic-state/react'
import type { FromWorker, ToWorker } from 'semantic-state/worker'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Article } from '../types.ts'
import { useNeighbors } from './useNeighbors.ts'

const article = (id: number): Article => ({ id, title: `A${id}`, topic: 'Science', abstract: 'x', url: 'https://en.wikipedia.org/wiki/X' })
const row = (id: number, score: number) => ({ id, score, confidence: score, reason: { kind: 'interest' as const, becauseOf: null }, item: article(id) })

function setup() {
  const sent: ToWorker<Article>[] = []
  let listener: ((e: MessageEvent<FromWorker<Article>>) => void) | null = null
  const worker: WorkerLike<Article> = {
    postMessage: (m) => sent.push(m),
    addEventListener: (_t, fn) => {
      listener = fn
    },
    removeEventListener: () => {},
    terminate: vi.fn(),
  }
  const store = createSemanticStore(worker)
  const emit = (data: FromWorker<Article>) => act(() => listener?.({ data } as MessageEvent<FromWorker<Article>>))
  const wrapper = ({ children }: { children: ReactNode }) => <SemanticProvider store={store}>{children}</SemanticProvider>
  const similarRequests = () => sent.filter((m) => m.type === 'similar')
  return { store, emit, wrapper, similarRequests }
}

describe('useNeighbors', () => {
  it('waits for the worker, then requests each expanded id once', () => {
    const { emit, wrapper, similarRequests } = setup()
    const { rerender } = renderHook(({ ids }) => useNeighbors(ids, 2), { wrapper, initialProps: { ids: [1] as readonly number[] } })
    expect(similarRequests()).toEqual([])
    emit({ type: 'ready', weights: { text: 1 } })
    expect(similarRequests()).toEqual([{ type: 'similar', id: 1, k: 2 }])
    rerender({ ids: [1, 2] })
    expect(similarRequests()).toEqual([{ type: 'similar', id: 1, k: 2 }, { type: 'similar', id: 2, k: 2 }])
  })

  it('builds neighbour lists and undirected edges, keeping the stronger similarity', () => {
    const { emit, wrapper } = setup()
    const { result } = renderHook(() => useNeighbors([1, 2], 2), { wrapper })
    emit({ type: 'ready', weights: { text: 1 } })
    emit({ type: 'similar', id: 1, k: 2, results: [row(2, 0.6), row(3, 0.5)] })
    emit({ type: 'similar', id: 2, k: 2, results: [row(1, 0.7)] })
    expect(result.current.neighboursOf).toEqual(new Map([[1, [2, 3]], [2, [1]]]))
    expect(result.current.edges).toEqual([
      { source: 2, target: 1, similarity: 0.7 },
      { source: 1, target: 3, similarity: 0.5 },
    ])
  })

  it('re-requests every id when the weights change', () => {
    const { store, emit, wrapper, similarRequests } = setup()
    renderHook(() => useNeighbors([1, 2], 2), { wrapper })
    emit({ type: 'ready', weights: { text: 1 } })
    act(() => store.setWeights({ text: 1, topic: 0.5 }))
    expect(similarRequests()).toHaveLength(4)
  })
})
