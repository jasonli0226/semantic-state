import { describe, expect, it, vi } from 'vitest'
import type { FromWorker, QueryResult, ToWorker } from '../worker/protocol.ts'
import { MAX_QUERY_LENGTH, type WorkerLike, createSemanticStore, normalizeQuery } from './store.ts'

type Doc = { id: string }

function fakeWorker() {
  const sent: ToWorker<Doc>[] = []
  let listener: ((e: MessageEvent<FromWorker<Doc>>) => void) | null = null
  const worker: WorkerLike<Doc> = {
    postMessage: (m) => sent.push(m),
    addEventListener: (_t, fn) => {
      listener = fn
    },
    removeEventListener: () => {
      listener = null
    },
    terminate: vi.fn(),
  }
  return { worker, sent, emit: (data: FromWorker<Doc>) => listener?.({ data } as MessageEvent<FromWorker<Doc>>) }
}

const result: QueryResult<Doc> = { ranked: [], extras: [], interests: [], rankMs: 1, itemCount: 0, updatedAt: 0, networkRequests: null }

describe('semantic store', () => {
  it('tracks worker and model status', () => {
    const { worker, emit } = fakeWorker()
    const store = createSemanticStore(worker)
    expect(store.getSnapshot()).toMatchObject({ status: 'starting', model: { status: 'idle' } })
    emit({ type: 'ready', weights: { text: 1 } })
    emit({ type: 'modelProgress', progress: 0.4 })
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', weights: { text: 1 }, model: { status: 'loading', progress: 0.4 } })
    emit({ type: 'modelReady' })
    expect(store.getSnapshot().model).toEqual({ status: 'ready', progress: 1, error: null })
    emit({ type: 'modelError', message: 'offline' })
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', model: { status: 'error', error: 'offline' } })
    emit({ type: 'error', message: 'boom' })
    expect(store.getSnapshot()).toMatchObject({ status: 'error', error: 'boom' })
  })

  it('reference-counts watched queries', () => {
    const { worker, sent } = fakeWorker()
    const store = createSemanticStore(worker)
    const stopA = store.watch('fire')
    const stopB = store.watch('fire')
    stopA()
    expect(sent.filter((m) => m.type === 'unwatch')).toEqual([])
    stopB()
    stopB() // idempotent
    expect(sent.map((m) => m.type)).toEqual(['watch', 'unwatch'])
  })

  it('normalizes queries: trimmed and capped', () => {
    expect(normalizeQuery(`  ${'a'.repeat(MAX_QUERY_LENGTH + 10)} `)).toBe('a'.repeat(MAX_QUERY_LENGTH))
    const { worker, sent } = fakeWorker()
    createSemanticStore(worker).watch('  fire  ')
    expect(sent[0]).toEqual({ type: 'watch', query: 'fire' })
  })

  it('stores results and similar lists and notifies subscribers', () => {
    const { worker, emit } = fakeWorker()
    const store = createSemanticStore(worker)
    const listener = vi.fn()
    store.subscribe(listener)
    emit({ type: 'results', query: 'fire', result })
    emit({ type: 'similar', id: 'a', k: 3, results: [] })
    expect(store.getSnapshot().results.fire).toBe(result)
    expect(store.getSnapshot().similar['a:3']).toEqual([])
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('forwards commands', () => {
    const { worker, sent } = fakeWorker()
    const store = createSemanticStore(worker)
    const v = new Float32Array([1])
    store.upsert([{ id: 'a' }], { vectors: [['a', v]] })
    store.remove(['a'])
    store.reset([])
    store.interact('a')
    store.interact('a', 'done')
    store.forget('a')
    store.clearInterests()
    store.setWeights({ text: 2 })
    store.requestSimilar('a', 4)
    expect(sent).toEqual([
      { type: 'upsert', items: [{ id: 'a' }], vectors: [['a', v]] },
      { type: 'remove', ids: ['a'] },
      { type: 'reset', items: [] },
      { type: 'interact', id: 'a', kind: 'open' },
      { type: 'interact', id: 'a', kind: 'done' },
      { type: 'forget', id: 'a' },
      { type: 'clearInterests' },
      { type: 'weights', weights: { text: 2 } },
      { type: 'similar', id: 'a', k: 4 },
    ])
    expect(store.getSnapshot().weights).toEqual({ text: 2 })
  })

  it('passes embeddings to listeners', () => {
    const { worker, emit } = fakeWorker()
    const store = createSemanticStore(worker)
    const onEmbedded = vi.fn()
    const onQuery = vi.fn()
    store.onEmbedded(onEmbedded)
    store.onQueryEmbedded(onQuery)
    const v = new Float32Array([1])
    emit({ type: 'embedded', vectors: [['a', v]], embedMs: 2 })
    emit({ type: 'queryEmbedded', query: 'q', vector: v })
    expect(onEmbedded).toHaveBeenCalledWith([['a', v]])
    expect(onQuery).toHaveBeenCalledWith('q', v)
    expect(store.getSnapshot().lastEmbedMs).toBe(2)
  })

  it('terminates the worker on dispose', () => {
    const { worker } = fakeWorker()
    createSemanticStore(worker).dispose()
    expect(worker.terminate).toHaveBeenCalled()
  })
})
