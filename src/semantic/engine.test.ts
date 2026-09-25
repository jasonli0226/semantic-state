import { describe, expect, it, vi } from 'vitest'
import type { Item } from '../core/types.ts'
import { createSemanticEngine, type WorkerLike } from './engine.ts'
import type { FromWorker, ToWorker } from './protocol.ts'

function fakeWorker() {
  const sent: ToWorker[] = []
  let listener: ((e: MessageEvent<FromWorker>) => void) | null = null
  const worker: WorkerLike = {
    postMessage: (msg) => sent.push(msg),
    addEventListener: (_type, fn) => {
      listener = fn
    },
    removeEventListener: () => {
      listener = null
    },
    terminate: vi.fn(),
  }
  const emit = (data: FromWorker) => listener?.({ data } as MessageEvent<FromWorker>)
  return { worker, sent, emit }
}

const item: Item = { id: 'a', source: 'email', sender: 's', title: 't', body: '', labels: [], dueAt: null, createdAt: 0 }

describe('semantic engine', () => {
  it('starts loading and becomes ready', () => {
    const { worker, sent, emit } = fakeWorker()
    const engine = createSemanticEngine(worker)
    engine.start([item])
    expect(sent[0]).toEqual({ type: 'init', items: [item] })
    expect(engine.getSnapshot().status).toBe('loading')
    emit({ type: 'progress', progress: 0.5 })
    expect(engine.getSnapshot().progress).toBe(0.5)
    emit({ type: 'ready' })
    expect(engine.getSnapshot().status).toBe('ready')
  })

  it('notifies subscribers with a new snapshot object on every change', () => {
    const { worker, emit } = fakeWorker()
    const engine = createSemanticEngine(worker)
    const listener = vi.fn()
    const unsubscribe = engine.subscribe(listener)
    const before = engine.getSnapshot()
    emit({ type: 'ranked', query: 'q', result: { ranked: [], duplicates: [], rankMs: 1, itemCount: 0, updatedAt: 0, networkRequests: 0 } })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(engine.getSnapshot()).not.toBe(before)
    expect(engine.getSnapshot().results.q.rankMs).toBe(1)
    unsubscribe()
    emit({ type: 'ready' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('watches each query once, however many components ask', () => {
    const { worker, sent } = fakeWorker()
    const engine = createSemanticEngine(worker)
    engine.watch('q')
    engine.watch('q')
    expect(sent.filter((m) => m.type === 'watch')).toEqual([{ type: 'watch', query: 'q' }])
  })

  it('forwards commands to the worker', () => {
    const { worker, sent } = fakeWorker()
    const engine = createSemanticEngine(worker)
    engine.upsert([item])
    engine.interact('a', 'open')
    engine.scale(100)
    engine.reset([item])
    expect(sent.map((m) => m.type)).toEqual(['upsert', 'interact', 'scale', 'reset'])
  })

  it('surfaces worker errors in the snapshot', () => {
    const { worker, emit } = fakeWorker()
    const engine = createSemanticEngine(worker)
    emit({ type: 'error', message: 'model download failed' })
    expect(engine.getSnapshot()).toMatchObject({ status: 'error', error: 'model download failed' })
  })

  it('passes embeddings and query vectors to listeners', () => {
    const { worker, emit } = fakeWorker()
    const engine = createSemanticEngine(worker)
    const onEmbedded = vi.fn()
    const onQuery = vi.fn()
    engine.onEmbedded(onEmbedded)
    engine.onQueryEmbedded(onQuery)
    const vector = new Float32Array([1])
    emit({ type: 'embedded', vectors: [{ id: 'a', vector }], embedMs: 3, synthetic: [] })
    emit({ type: 'queryEmbedded', query: 'q', vector })
    expect(onEmbedded).toHaveBeenCalledWith({ vectors: [{ id: 'a', vector }], synthetic: [] })
    expect(onQuery).toHaveBeenCalledWith('q', vector)
    expect(engine.getSnapshot().lastEmbedMs).toBe(3)
  })

  it('terminates the worker on dispose', () => {
    const { worker } = fakeWorker()
    createSemanticEngine(worker).dispose()
    expect(worker.terminate).toHaveBeenCalled()
  })
})
