import { describe, expect, it, vi } from 'vitest'
import { type PokedexWorker, createPokedexEngine, MAX_QUERY_LENGTH } from './engine.ts'
import type { PokedexFromWorker, PokedexToWorker } from './protocol.ts'
import type { Pokemon } from './types.ts'

function fakeWorker() {
  const sent: PokedexToWorker[] = []
  let listener: ((e: MessageEvent<PokedexFromWorker>) => void) | null = null
  const worker: PokedexWorker = {
    postMessage: (msg) => sent.push(msg),
    addEventListener: (_t, fn) => {
      listener = fn
    },
    removeEventListener: () => {
      listener = null
    },
    terminate: vi.fn(),
  }
  return { worker, sent, emit: (data: PokedexFromWorker) => listener?.({ data } as MessageEvent<PokedexFromWorker>) }
}

const pikachu = { id: 25, name: 'Pikachu' } as Pokemon

describe('pokedex engine', () => {
  it('loads the dex, then the model only on demand', () => {
    const { worker, sent, emit } = fakeWorker()
    const engine = createPokedexEngine(worker)
    engine.start()
    expect(sent).toEqual([{ type: 'init' }])
    emit({ type: 'loaded', pokedex: [pikachu] })
    expect(engine.getSnapshot()).toMatchObject({ status: 'ready', model: { status: 'idle' } })
    expect(engine.getSnapshot().byId.get(25)).toBe(pikachu)
    emit({ type: 'modelProgress', progress: 0.3 })
    expect(engine.getSnapshot().model).toEqual({ status: 'loading', progress: 0.3 })
    emit({ type: 'modelReady' })
    expect(engine.getSnapshot().model.status).toBe('ready')
  })

  it('trims and caps search text before sending it', () => {
    const { worker, sent } = fakeWorker()
    const engine = createPokedexEngine(worker)
    engine.search(`  ${'a'.repeat(MAX_QUERY_LENGTH + 50)}  `)
    expect(sent[0]).toEqual({ type: 'search', text: 'a'.repeat(MAX_QUERY_LENGTH) })
  })

  it('forwards interactions and weights', () => {
    const { worker, sent } = fakeWorker()
    const engine = createPokedexEngine(worker)
    engine.click(25)
    engine.forget(25)
    engine.clear()
    engine.setWeights({ text: 1, type: 0, stats: 0 })
    engine.similar(25)
    expect(sent.map((m) => m.type)).toEqual(['click', 'forget', 'clear', 'weights', 'similar'])
    expect(engine.getSnapshot().weights).toEqual({ text: 1, type: 0, stats: 0 })
  })

  it('stores results and similar lists, notifying subscribers', () => {
    const { worker, emit } = fakeWorker()
    const engine = createPokedexEngine(worker)
    const listener = vi.fn()
    engine.subscribe(listener)
    const result = { ranked: [], familyExtras: [], interests: [], query: 'mouse', rankMs: 1, networkRequests: 0 }
    emit({ type: 'ranked', result })
    emit({ type: 'similar', id: 25, results: [] })
    expect(engine.getSnapshot().result).toBe(result)
    expect(engine.getSnapshot().similar).toEqual({ id: 25, results: [] })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('surfaces errors and terminates on dispose', () => {
    const { worker, emit } = fakeWorker()
    const engine = createPokedexEngine(worker)
    emit({ type: 'error', message: 'vectors.bin: expected 1 bytes' })
    expect(engine.getSnapshot()).toMatchObject({ status: 'error', error: 'vectors.bin: expected 1 bytes' })
    engine.dispose()
    expect(worker.terminate).toHaveBeenCalled()
  })

  it('keeps the dex usable when only the search model fails', () => {
    const { worker, emit } = fakeWorker()
    const engine = createPokedexEngine(worker)
    emit({ type: 'loaded', pokedex: [pikachu] })
    emit({ type: 'modelError', message: 'offline' })
    expect(engine.getSnapshot()).toMatchObject({ status: 'ready', model: { status: 'error', progress: 0, error: 'offline' } })
  })
})
