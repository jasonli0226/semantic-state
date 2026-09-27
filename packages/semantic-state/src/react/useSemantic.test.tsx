import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { type WorkerLike, createSemanticStore } from '../store/store.ts'
import type { FromWorker, QueryResult, ToWorker } from '../worker/protocol.ts'
import { SemanticProvider } from './context.tsx'
import { useSemantic, useSemanticSnapshot, useSimilar } from './useSemantic.ts'

type Doc = { id: string; title: string }
const docA: Doc = { id: 'a', title: 'A' }
const docB: Doc = { id: 'b', title: 'B' }

function setup() {
  const sent: ToWorker<Doc>[] = []
  let listener: ((e: MessageEvent<FromWorker<Doc>>) => void) | null = null
  const worker: WorkerLike<Doc> = {
    postMessage: (m) => sent.push(m),
    addEventListener: (_t, fn) => {
      listener = fn
    },
    removeEventListener: () => {},
    terminate: vi.fn(),
  }
  const store = createSemanticStore(worker)
  const emit = (data: FromWorker<Doc>) => act(() => listener?.({ data } as MessageEvent<FromWorker<Doc>>))
  const wrapper = ({ children }: { children: ReactNode }) => <SemanticProvider store={store}>{children}</SemanticProvider>
  return { store, sent, emit, wrapper }
}

const result = (rows: [Doc, number][], extras: [string, number][] = []): QueryResult<Doc> => ({
  ranked: rows.map(([item, score]) => ({ id: item.id, item, score, confidence: 0.5, reason: { kind: 'search', becauseOf: null } })),
  extras,
  interests: [{ id: 'b', weight: 1, item: docB }],
  rankMs: 2,
  itemCount: 2,
  updatedAt: 7,
  networkRequests: 0,
})

describe('useSemantic', () => {
  it('returns the same empty interests and beliefs on every render before the first result (#24)', () => {
    const { wrapper } = setup()
    const { result: hook, rerender } = renderHook(() => useSemantic<Doc>('cats'), { wrapper })
    const first = hook.current
    rerender()
    expect(hook.current.interests).toEqual([])
    expect(hook.current.interests).toBe(first.interests)
    expect(hook.current.beliefs).toBe(first.beliefs)
  })

  it('watches the query while mounted and returns beliefs with the item as value', () => {
    const { sent, emit, wrapper } = setup()
    const { result: hook, unmount } = renderHook(() => useSemantic<Doc>('  cats '), { wrapper })
    expect(sent).toEqual([{ type: 'watch', query: 'cats' }])
    emit({ type: 'results', query: 'cats', result: result([[docA, 0.9], [docB, 0.2]], [['a', 2]]) })
    expect(hook.current.beliefs.map((b) => b.value)).toEqual([docA, docB])
    expect(hook.current.beliefs[0]).toMatchObject({ confidence: 0.5, groupExtras: 2, updatedAt: 7, reason: { kind: 'search' } })
    expect(hook.current.interests).toEqual([{ id: 'b', weight: 1, item: docB }])
    expect(hook.current.rankMs).toBe(2)
    unmount()
    expect(sent.at(-1)).toEqual({ type: 'unwatch', query: 'cats' })
  })

  it('exposes background embedding progress', () => {
    const { emit, wrapper } = setup()
    const { result: hook } = renderHook(() => useSemantic<Doc>('cats'), { wrapper })
    expect(hook.current.embedding).toBeNull()
    emit({ type: 'embedProgress', done: 32, total: 100 })
    expect(hook.current.embedding).toEqual({ done: 32, total: 100 })
    emit({ type: 'embedProgress', done: 100, total: 100 })
    expect(hook.current.embedding).toBeNull()
  })

  it('keeps showing the previous results while a new query is being ranked', () => {
    const { emit, wrapper } = setup()
    const { result: hook, rerender } = renderHook(({ q }) => useSemantic<Doc>(q), { wrapper, initialProps: { q: 'cats' } })
    emit({ type: 'results', query: 'cats', result: result([[docA, 0.9]]) })
    rerender({ q: 'dogs' })
    expect(hook.current.beliefs.map((b) => b.value.id)).toEqual(['a'])
    expect(hook.current.query).toBe('dogs')
    expect(hook.current.resultQuery).toBe('cats')
  })

  it('keeps the commit policy while the list first fills, then commits the first complete ranking once', () => {
    const { emit, wrapper } = setup()
    const { result: hook } = renderHook(() => useSemantic<Doc>('cats', { commit: 'manual' }), { wrapper })
    const order = () => hook.current.beliefs.map((b) => b.value.id)
    emit({ type: 'embedProgress', done: 0, total: 2 })
    emit({ type: 'results', query: 'cats', result: result([[docA, 0.9], [docB, 0.2]]) })
    emit({ type: 'results', query: 'cats', result: result([[docA, 0.1], [docB, 0.9]]) }) // partial ranking: manual holds it
    expect(order()).toEqual(['a', 'b'])
    emit({ type: 'embedProgress', done: 2, total: 2 })
    emit({ type: 'results', query: 'cats', result: result([[docA, 0.1], [docB, 0.9]]) }) // the first complete ranking
    expect(order()).toEqual(['b', 'a'])
    emit({ type: 'results', query: 'cats', result: result([[docA, 0.9], [docB, 0.1]]) })
    expect(order()).toEqual(['b', 'a']) // held from now on
    expect(hook.current.pending.movedUp).toBeGreaterThan(0)
  })

  it('places the first complete ranking by its own scores, not ones held from partial results', () => {
    const { emit, wrapper } = setup()
    const { result: hook } = renderHook(() => useSemantic<Doc>('cats', { commit: 'manual', hysteresis: 0.05 }), { wrapper })
    emit({ type: 'embedProgress', done: 0, total: 2 })
    emit({ type: 'results', query: 'cats', result: result([[docA, 0.5], [docB, 0.48]]) })
    emit({ type: 'embedProgress', done: 2, total: 2 })
    emit({ type: 'results', query: 'cats', result: result([[docA, 0.48], [docB, 0.5]]) }) // within hysteresis of the partial scores
    expect(hook.current.beliefs.map((b) => b.value.id)).toEqual(['b', 'a'])
  })

  it('applies the commit policy (manual holds the order)', () => {
    const { emit, wrapper } = setup()
    const { result: hook } = renderHook(() => useSemantic<Doc>('cats', { commit: 'manual' }), { wrapper })
    emit({ type: 'results', query: 'cats', result: result([[docA, 0.9], [docB, 0.2]]) })
    emit({ type: 'results', query: 'cats', result: result([[docA, 0.1], [docB, 0.9]]) })
    expect(hook.current.beliefs.map((b) => b.value.id)).toEqual(['a', 'b'])
    expect(hook.current.pending.movedUp).toBe(1)
    act(() => hook.current.commit())
    expect(hook.current.beliefs.map((b) => b.value.id)).toEqual(['b', 'a'])
  })
})

describe('useSimilar', () => {
  it('requests neighbours once the worker is ready and again when weights change', () => {
    const { store, sent, emit, wrapper } = setup()
    const { result: hook } = renderHook(() => useSimilar<Doc>('a', 3), { wrapper })
    expect(sent.filter((m) => m.type === 'similar')).toEqual([])
    emit({ type: 'ready', weights: { text: 1 } })
    expect(sent.filter((m) => m.type === 'similar')).toEqual([{ type: 'similar', id: 'a', k: 3 }])
    emit({ type: 'similar', id: 'a', k: 3, results: [{ id: 'b', item: docB, score: 0.4, confidence: 0.3, reason: { kind: 'interest', becauseOf: 'a' } }] })
    expect(hook.current?.map((r) => r.item)).toEqual([docB])
    act(() => store.setWeights({ text: 2 }))
    expect(sent.filter((m) => m.type === 'similar')).toHaveLength(2)
  })

  it('returns null for no id', () => {
    const { wrapper } = setup()
    expect(renderHook(() => useSimilar<Doc>(null), { wrapper }).result.current).toBeNull()
  })
})

describe('useSemanticSnapshot', () => {
  it('exposes status, model state and weights', () => {
    const { emit, wrapper } = setup()
    const { result: hook } = renderHook(() => useSemanticSnapshot<Doc>(), { wrapper })
    emit({ type: 'ready', weights: { text: 1, type: 0.5 } })
    expect(hook.current).toMatchObject({ status: 'ready', weights: { text: 1, type: 0.5 }, model: { status: 'idle' } })
  })
})

describe('SemanticProvider', () => {
  it('throws a helpful error when a hook is used outside it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useSemantic('x'))).toThrow(/SemanticProvider/)
  })
})

describe('server rendering', () => {
  it('renders every hook with the initial snapshot instead of throwing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { store } = setup()
    function List() {
      const { status, beliefs } = useSemantic<Doc>('cats')
      const similar = useSimilar<Doc>('a')
      const snapshot = useSemanticSnapshot<Doc>()
      return <p>{`${status}/${beliefs.length}/${similar === null}/${snapshot.model.status}`}</p>
    }
    const html = renderToString(<SemanticProvider store={store}><List /></SemanticProvider>)
    expect(html).toBe('<p>starting/0/true/idle</p>')
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('serves the initial snapshot on the server even after the store has updated', () => {
    const { store, emit } = setup()
    emit({ type: 'ready', weights: { text: 1 } })
    expect(store.getSnapshot().status).toBe('ready')
    expect(store.getServerSnapshot()).toMatchObject({ status: 'starting', results: {}, weights: {} })
    expect(store.getServerSnapshot()).toBe(store.getServerSnapshot())
  })
})
