import { describe, expect, it, vi } from 'vitest'
import { defaultScorer } from '../core/rank.ts'
import type { Id, Vec } from '../core/types.ts'
import type { Embedder } from './embedder.ts'
import type { FromWorker, ToWorker } from './protocol.ts'
import { type SemanticWorkerConfig, createWorkerRuntime } from './runtime.ts'

interface Doc {
  readonly id: string
  readonly text: string
  readonly group?: string
}

/** Embeds by keyword: "fire" → x axis, "water" → y axis, anything else → z. */
const keywordVector = (text: string): Vec => new Float32Array(text.includes('fire') ? [1, 0, 0] : text.includes('water') ? [0, 1, 0] : [0, 0, 1])

function fakeEmbedder(opts: { fail?: boolean } = {}): Embedder & { calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    async embed(texts, onProgress) {
      calls.push([...texts])
      onProgress(0.5)
      if (opts.fail) throw new Error('offline')
      return texts.map(keywordVector)
    },
  }
}

/** A keyword embedder that holds every call until open() — a model still downloading. */
function gatedEmbedder(): Embedder & { calls: string[][]; open: () => void } {
  let open = () => {}
  const gate = new Promise<void>((resolve) => (open = resolve))
  const inner = fakeEmbedder()
  return {
    calls: inner.calls,
    open,
    async embed(texts, onProgress) {
      await gate
      return inner.embed(texts, onProgress)
    },
  }
}

/** A keyword embedder where every call waits until the test releases it; release() finishes the oldest waiting call. */
function steppedEmbedder(): Embedder & { calls: string[][]; release: () => void } {
  const calls: string[][] = []
  const gates: (() => void)[] = []
  return {
    calls,
    release: () => gates.shift()?.(),
    async embed(texts) {
      calls.push([...texts])
      await new Promise<void>((resolve) => gates.push(resolve))
      return texts.map(keywordVector)
    },
  }
}

function harness(config: Partial<SemanticWorkerConfig<Doc>> = {}) {
  const out: FromWorker<Doc>[] = []
  let listener: ((e: MessageEvent<ToWorker<Doc>>) => void) | null = null
  const port = {
    postMessage: (m: FromWorker<Doc>) => out.push(m),
    addEventListener: (_t: 'message', fn: (e: MessageEvent<ToWorker<Doc>>) => void) => {
      listener = fn
    },
  }
  const embedder = fakeEmbedder()
  const runtime = createWorkerRuntime<Doc>(
    { id: (d) => d.id, text: (d) => d.text, embedder, interests: { mode: 'multi' }, ...config },
    port,
    { resourceCount: () => 0 },
  )
  const dispatch = (m: ToWorker<Doc>) => listener?.({ data: m } as MessageEvent<ToWorker<Doc>>)
  const send = async (m: ToWorker<Doc>) => {
    dispatch(m)
    await runtime.idle()
  }
  const last = <K extends FromWorker<Doc>['type']>(type: K) =>
    out.filter((m): m is Extract<FromWorker<Doc>, { type: K }> => m.type === type).at(-1)
  return { out, dispatch, send, last, embedder, runtime }
}

const docs: Doc[] = [
  { id: 'a', text: 'fire lizard', group: 'g1' },
  { id: 'b', text: 'fire dragon', group: 'g1' },
  { id: 'c', text: 'water turtle', group: 'g2' },
  { id: 'd', text: 'rock snake', group: 'g3' },
]

const sixDocs: Doc[] = [
  { id: 'f1', text: 'fire one' },
  { id: 'f2', text: 'fire two' },
  { id: 'w1', text: 'water one' },
  { id: 'w2', text: 'water two' },
  { id: 'r1', text: 'rock one' },
  { id: 'r2', text: 'rock two' },
]

const resultsFor = (h: ReturnType<typeof harness>, query: string) =>
  h.out.filter((m): m is Extract<FromWorker<Doc>, { type: 'results' }> => m.type === 'results' && m.query === query)

const progressOf = (h: ReturnType<typeof harness>) =>
  h.out.filter((m): m is Extract<FromWorker<Doc>, { type: 'embedProgress' }> => m.type === 'embedProgress').map(({ done, total }) => [done, total])

describe('worker runtime', () => {
  it('announces ready with the initial weights', async () => {
    const h = harness({ weights: { text: 2 } })
    await h.runtime.idle()
    expect(h.out[0]).toEqual({ type: 'ready', weights: { text: 2 } })
  })

  it('embeds on upsert, ranks watched queries and returns items with results', async () => {
    const h = harness()
    await h.send({ type: 'upsert', items: docs })
    await h.send({ type: 'watch', query: 'water' })
    const result = h.last('results')!
    expect(result.query).toBe('water')
    expect(result.result.ranked[0]).toMatchObject({ id: 'c', item: docs[2], reason: { kind: 'search' } })
    expect(result.result.itemCount).toBe(4)
    expect(h.last('modelReady')).toBeDefined()
  })

  it('does not re-embed unchanged items, but does re-embed edited ones', async () => {
    const h = harness()
    await h.send({ type: 'upsert', items: docs })
    await h.send({ type: 'upsert', items: docs })
    await h.send({ type: 'upsert', items: [{ ...docs[0], text: 'water lizard' }] })
    expect(h.embedder.calls.map((c) => c.length)).toEqual([4, 1])
  })

  it('uses precomputed vectors instead of embedding', async () => {
    const h = harness({ precomputed: async () => [['a', new Float32Array([1, 0, 0])] as const] })
    await h.runtime.idle()
    await h.send({ type: 'upsert', items: [docs[0]] })
    expect(h.embedder.calls).toEqual([])
  })

  it('accepts vectors sent with the items', async () => {
    const h = harness()
    await h.send({ type: 'upsert', items: [docs[0]], vectors: [['a', new Float32Array([1, 0, 0])]] })
    expect(h.embedder.calls).toEqual([])
  })

  it('an empty query ranks by interests only and never loads the model for it', async () => {
    const h = harness({ precomputed: async () => docs.map((d, i) => [d.id, new Float32Array([i === 2 ? 0 : 1, i === 2 ? 1 : 0, 0])] as const) })
    await h.send({ type: 'upsert', items: docs })
    await h.send({ type: 'watch', query: '' })
    expect(h.last('results')!.result.ranked).toEqual([])
    await h.send({ type: 'interact', id: 'a', kind: 'open' })
    const ranked = h.last('results')!.result.ranked
    expect(ranked[0]).toMatchObject({ id: 'b', reason: { kind: 'interest', becauseOf: 'a' } })
    expect(h.embedder.calls).toEqual([])
  })

  it('groups by key and reports how many were folded', async () => {
    const h = harness({ group: { key: (d) => d.group ?? d.id } })
    await h.send({ type: 'upsert', items: docs })
    await h.send({ type: 'watch', query: 'fire' })
    const { ranked, extras } = h.last('results')!.result
    expect(ranked.filter((r) => r.id === 'a' || r.id === 'b')).toHaveLength(1)
    expect(extras).toEqual([[ranked[0].id, 1]])
  })

  it('removes items, forgets interactions and resets', async () => {
    const h = harness()
    await h.send({ type: 'upsert', items: docs })
    await h.send({ type: 'watch', query: 'fire' })
    await h.send({ type: 'remove', ids: ['a'] })
    expect(h.last('results')!.result.ranked.map((r) => r.id)).not.toContain('a')
    await h.send({ type: 'interact', id: 'c', kind: 'open' })
    expect(h.last('results')!.result.interests.map((i) => i.id)).toEqual(['c'])
    await h.send({ type: 'forget', id: 'c' })
    expect(h.last('results')!.result.interests).toEqual([])
    await h.send({ type: 'reset', items: [docs[3]] })
    expect(h.last('results')!.result.itemCount).toBe(1)
    expect(h.embedder.calls).toHaveLength(2) // docs + query; reset reused the cached vector
  })

  it('stops ranking a query once unwatched', async () => {
    const h = harness()
    await h.send({ type: 'upsert', items: docs })
    await h.send({ type: 'watch', query: 'fire' })
    await h.send({ type: 'unwatch', query: 'fire' })
    const before = h.out.length
    await h.send({ type: 'interact', id: 'a', kind: 'open' })
    expect(h.out.slice(before).filter((m) => m.type === 'results')).toEqual([])
  })

  it('answers "similar to" outside the item’s own group', async () => {
    const h = harness({ group: { key: (d) => d.group ?? d.id } })
    await h.send({ type: 'upsert', items: docs })
    await h.send({ type: 'similar', id: 'a', k: 2 })
    const similar = h.last('similar')!
    expect(similar.results.map((r) => r.id)).not.toContain('b')
    expect(similar.results).toHaveLength(2)
  })

  it('reports model failures without breaking ranking', async () => {
    const h = harness({ embedder: fakeEmbedder({ fail: true }), precomputed: async () => [['a', new Float32Array([1, 0, 0])] as const] })
    await h.send({ type: 'upsert', items: [docs[0]] })
    await h.send({ type: 'watch', query: 'fire' })
    expect(h.last('modelError')!.message).toBe('offline')
    expect(h.last('results')!.result.ranked).toEqual([])
  })

  it('emits vectors when asked (for baselines that rank elsewhere)', async () => {
    const h = harness({ emitVectors: true })
    await h.send({ type: 'upsert', items: [docs[0]] })
    await h.send({ type: 'watch', query: 'fire' })
    expect(h.last('embedded')!.vectors.map(([id]: readonly [Id, Vec]) => id)).toEqual(['a'])
    expect(h.last('queryEmbedded')!.query).toBe('fire')
  })

  it('applies new weights', async () => {
    const h = harness()
    await h.send({ type: 'weights', weights: { text: 0.5 } })
    expect(h.last('results')).toBeUndefined() // nothing watched yet
    await h.send({ type: 'upsert', items: docs })
    await h.send({ type: 'watch', query: 'fire' })
    expect(h.last('results')).toBeDefined()
  })

  describe('while a query waits for the model', () => {
    const precomputed = async () => docs.map((d) => [d.id, keywordVector(d.text)] as const)

    it('still answers similar-item requests and clicks', async () => {
      const h = harness({ embedder: { embed: () => new Promise<Vec[]>(() => {}) }, precomputed })
      await h.send({ type: 'upsert', items: docs })
      h.dispatch({ type: 'watch', query: 'fire' })
      h.dispatch({ type: 'similar', id: 'a', k: 2 })
      h.dispatch({ type: 'interact', id: 'c', kind: 'open' })
      await vi.waitFor(() => expect(h.last('results')?.result.interests.map((i) => i.id)).toEqual(['c']))
      expect(h.last('similar')!.results.map((r) => r.id)).toContain('b')
    })

    it('ranks the query once its vector arrives, after the state changes sent before it', async () => {
      const embedder = gatedEmbedder()
      const h = harness({ embedder, precomputed })
      await h.send({ type: 'upsert', items: docs })
      h.dispatch({ type: 'watch', query: 'fire' })
      h.dispatch({ type: 'interact', id: 'c', kind: 'open' })
      embedder.open()
      await h.runtime.idle()
      const { result } = resultsFor(h, 'fire').at(-1)!
      expect(result.ranked[0]).toMatchObject({ reason: { kind: 'search' } })
      expect(['a', 'b']).toContain(result.ranked[0].id)
      expect(result.interests.map((i) => i.id)).toEqual(['c'])
    })

    it('drops a query unwatched before its vector arrives', async () => {
      const embedder = gatedEmbedder()
      const h = harness({ embedder, precomputed })
      await h.send({ type: 'upsert', items: docs })
      h.dispatch({ type: 'watch', query: 'fire' })
      h.dispatch({ type: 'unwatch', query: 'fire' })
      embedder.open()
      await h.runtime.idle()
      expect(resultsFor(h, 'fire')).toEqual([])
    })

    it('embeds a query re-watched mid-download only once', async () => {
      const embedder = gatedEmbedder()
      const h = harness({ embedder, precomputed })
      await h.send({ type: 'upsert', items: docs })
      h.dispatch({ type: 'watch', query: 'fire' })
      h.dispatch({ type: 'unwatch', query: 'fire' })
      h.dispatch({ type: 'watch', query: 'fire' })
      embedder.open()
      await h.runtime.idle()
      expect(embedder.calls).toEqual([['fire']])
      expect(resultsFor(h, 'fire')).toHaveLength(1)
    })
  })

  describe('background item embedding', () => {
    it('embeds in batches and reports progress per batch', async () => {
      const h = harness({ embedBatchSize: 2 })
      await h.send({ type: 'upsert', items: sixDocs })
      expect(h.embedder.calls.map((c) => c.length)).toEqual([2, 2, 2])
      expect(progressOf(h)).toEqual([[0, 6], [2, 6], [4, 6], [6, 6]])
    })

    it('ranks the items embedded so far after the first batch', async () => {
      const embedder = steppedEmbedder()
      const h = harness({ embedder, embedBatchSize: 2 })
      await h.send({ type: 'watch', query: '' }) // interest-only query, needs no model
      h.dispatch({ type: 'upsert', items: sixDocs })
      await vi.waitFor(() => expect(embedder.calls).toHaveLength(1))
      h.dispatch({ type: 'interact', id: 'f1', kind: 'open' })
      embedder.release() // batch 1: f1, f2
      await vi.waitFor(() => expect(embedder.calls).toHaveLength(2)) // batch 2 started, so batch 1 was applied
      const { result } = resultsFor(h, '').at(-1)!
      expect(result.ranked.map((r) => r.id)).toEqual(['f2']) // only embedded items rank; f1 is the interacted one
      expect(progressOf(h).at(-1)).toEqual([2, 6])
      embedder.release()
      await vi.waitFor(() => expect(embedder.calls).toHaveLength(3))
      embedder.release()
      await h.runtime.idle()
      expect(progressOf(h).at(-1)).toEqual([6, 6])
    })

    it('answers clicks and similar-item requests while a batch is being embedded', async () => {
      const h = harness({ embedder: { embed: () => new Promise<Vec[]>(() => {}) }, precomputed: async () => [['a', keywordVector('fire lizard')] as const, ['b', keywordVector('fire dragon')] as const] })
      await h.send({ type: 'upsert', items: docs.slice(0, 2) })
      await h.send({ type: 'watch', query: '' })
      h.dispatch({ type: 'upsert', items: sixDocs }) // needs the model, which never answers
      h.dispatch({ type: 'similar', id: 'a', k: 1 })
      h.dispatch({ type: 'interact', id: 'b', kind: 'open' })
      await vi.waitFor(() => expect(h.last('similar')?.results.map((r) => r.id)).toEqual(['b']))
      await vi.waitFor(() => expect(h.last('results')?.result.interests.map((i) => i.id)).toEqual(['b']))
    })

    it('does not rank an upsert that queued embedding until its first batch is applied', async () => {
      const embedder = gatedEmbedder()
      const h = harness({ embedder })
      await h.send({ type: 'watch', query: '' })
      const before = resultsFor(h, '').length
      h.dispatch({ type: 'upsert', items: sixDocs })
      await vi.waitFor(() => expect(progressOf(h)).toEqual([[0, 6]]))
      expect(resultsFor(h, '')).toHaveLength(before)
      embedder.open()
      await h.runtime.idle()
      expect(resultsFor(h, '').length).toBeGreaterThan(before)
    })

    it('still ranks at once an upsert that needs no embedding', async () => {
      const h = harness({ precomputed: async () => [['a', keywordVector('fire lizard')] as const] })
      await h.send({ type: 'watch', query: '' })
      await h.send({ type: 'upsert', items: [docs[0]] })
      expect(resultsFor(h, '').at(-1)!.result.itemCount).toBe(1)
      expect(progressOf(h)).toEqual([])
    })

    it('re-embeds an item edited while its batch was in flight, never storing the stale vector', async () => {
      const embedder = steppedEmbedder()
      const h = harness({ embedder, embedBatchSize: 6, emitVectors: true })
      h.dispatch({ type: 'upsert', items: sixDocs })
      await vi.waitFor(() => expect(embedder.calls).toHaveLength(1))
      h.dispatch({ type: 'upsert', items: [{ id: 'r1', text: 'water now' }] })
      embedder.release()
      await vi.waitFor(() => expect(embedder.calls).toHaveLength(2))
      expect(embedder.calls[1]).toEqual(['water now'])
      embedder.release()
      await h.runtime.idle()
      const r1 = h.out.flatMap((m) => (m.type === 'embedded' ? m.vectors : [])).filter(([id]) => id === 'r1')
      expect(r1.map(([, v]) => [...v])).toEqual([[0, 1, 0]]) // only the "water" vector, never the stale "rock" one
      expect(progressOf(h).at(-1)).toEqual([6, 6])
    })

    it('stores nothing for an item removed while its batch was in flight', async () => {
      const embedder = steppedEmbedder()
      const h = harness({ embedder, embedBatchSize: 6, emitVectors: true })
      h.dispatch({ type: 'upsert', items: sixDocs })
      await vi.waitFor(() => expect(embedder.calls).toHaveLength(1))
      h.dispatch({ type: 'remove', ids: ['w1'] })
      embedder.release()
      await h.runtime.idle()
      const ids = h.out.flatMap((m) => (m.type === 'embedded' ? m.vectors.map(([id]) => id) : []))
      expect(ids).not.toContain('w1')
      expect(h.out.filter((m) => m.type === 'error')).toEqual([])
    })

    it('keeps a vector the app supplied while the same item was being embedded', async () => {
      const embedder = steppedEmbedder()
      const h = harness({ embedder, embedBatchSize: 6, emitVectors: true })
      await h.send({ type: 'watch', query: '' })
      h.dispatch({ type: 'upsert', items: sixDocs })
      await vi.waitFor(() => expect(embedder.calls).toHaveLength(1))
      h.dispatch({ type: 'upsert', items: [sixDocs[4]], vectors: [['r1', new Float32Array([1, 0, 0])]] })
      embedder.release()
      await h.runtime.idle()
      const ids = h.out.flatMap((m) => (m.type === 'embedded' ? m.vectors.map(([id]) => id) : []))
      expect(ids).not.toContain('r1')
      h.dispatch({ type: 'interact', id: 'f1', kind: 'open' })
      await h.runtime.idle()
      expect(resultsFor(h, '').at(-1)!.result.ranked.map((r) => r.id)).toContain('r1') // ranks by the supplied fire-like vector
    })

    it('drops queued items a reset leaves out', async () => {
      const embedder = steppedEmbedder()
      const h = harness({ embedder, embedBatchSize: 2 })
      h.dispatch({ type: 'upsert', items: sixDocs })
      await vi.waitFor(() => expect(embedder.calls).toHaveLength(1))
      h.dispatch({ type: 'reset', items: sixDocs.slice(0, 2) })
      embedder.release()
      await h.runtime.idle()
      expect(embedder.calls).toEqual([['fire one', 'fire two']])
    })

    it('ranks at once a reset that queues nothing new, so removed items leave the results', async () => {
      const embedder = steppedEmbedder()
      const h = harness({ embedder, embedBatchSize: 2 })
      await h.send({ type: 'watch', query: '' })
      h.dispatch({ type: 'upsert', items: sixDocs })
      await vi.waitFor(() => expect(embedder.calls).toHaveLength(1))
      h.dispatch({ type: 'reset', items: sixDocs.slice(2, 4) }) // w1, w2: already queued, not in the batch in flight
      await vi.waitFor(() => expect(resultsFor(h, '').at(-1)?.result.itemCount).toBe(2))
    })

    it('adds an upsert made mid-job to the running job', async () => {
      const embedder = steppedEmbedder()
      const h = harness({ embedder, embedBatchSize: 2 })
      h.dispatch({ type: 'upsert', items: sixDocs.slice(0, 2) })
      await vi.waitFor(() => expect(embedder.calls).toHaveLength(1))
      h.dispatch({ type: 'upsert', items: sixDocs.slice(2, 4) })
      embedder.release()
      await vi.waitFor(() => expect(embedder.calls).toHaveLength(2))
      embedder.release()
      await h.runtime.idle()
      expect(progressOf(h)).toEqual([[0, 2], [2, 4], [4, 4]])
    })

    it('never leaves an item queued with no job running (upsert between the last embed and its apply step)', async () => {
      const gate: { finish?: () => void } = {}
      const inner = fakeEmbedder()
      const embedder: Embedder = {
        async embed(texts, onProgress) {
          const out = await inner.embed(texts, onProgress)
          if (inner.calls.length === 1) await new Promise<void>((resolve) => (gate.finish = resolve))
          return out
        },
      }
      const h = harness({ embedder, embedBatchSize: 2 })
      h.dispatch({ type: 'upsert', items: sixDocs.slice(0, 2) })
      await vi.waitFor(() => expect(gate.finish).toBeDefined())
      gate.finish!() // the batch resolves; its apply step is queued behind the upsert dispatched next
      h.dispatch({ type: 'upsert', items: sixDocs.slice(2, 4) })
      await h.runtime.idle()
      expect(inner.calls).toEqual([['fire one', 'fire two'], ['water one', 'water two']])
      expect(progressOf(h).at(-1)).toEqual([4, 4])
    })

    it('keeps done <= total through edits, removes and re-adds, and ends every job at done === total', async () => {
      const embedder = steppedEmbedder()
      const h = harness({ embedder, embedBatchSize: 2 })
      h.dispatch({ type: 'upsert', items: sixDocs })
      await vi.waitFor(() => expect(embedder.calls).toHaveLength(1))
      h.dispatch({ type: 'upsert', items: [{ id: 'f1', text: 'fire edited' }] })
      h.dispatch({ type: 'remove', ids: ['w1'] })
      h.dispatch({ type: 'upsert', items: [sixDocs[2]] }) // w1 back, same text
      const ended = () => {
        const all = progressOf(h)
        return all.length > 1 && all.at(-1)![0] === all.at(-1)![1]
      }
      while (!ended()) {
        embedder.release() // a no-op when no batch is waiting yet
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      await h.runtime.idle()
      for (const [done, total] of progressOf(h)) expect(done).toBeLessThanOrEqual(total)
      const [done, total] = progressOf(h).at(-1)!
      expect(done).toBe(total)
    })

    it('on a failed batch: reports it, ends progress, re-ranks, keeps earlier vectors, and retries on the next upsert', async () => {
      let calls = 0
      const inner = fakeEmbedder()
      const flaky: Embedder = {
        async embed(texts, onProgress) {
          calls++
          if (calls === 2) throw new Error('offline')
          return inner.embed(texts, onProgress)
        },
      }
      const h = harness({ embedder: flaky, embedBatchSize: 2, emitVectors: true })
      await h.send({ type: 'watch', query: '' })
      const before = resultsFor(h, '').length
      await h.send({ type: 'upsert', items: sixDocs })
      expect(h.last('modelError')!.message).toBe('offline')
      expect(progressOf(h).at(-1)).toEqual([6, 6])
      expect(resultsFor(h, '').length).toBeGreaterThan(before)
      const lastIndex = (type: FromWorker<Doc>['type']) => h.out.findLastIndex((m) => m.type === type)
      expect(lastIndex('results')).toBeGreaterThan(lastIndex('modelError')) // the failure itself re-ranks
      const embedded = h.out.flatMap((m) => (m.type === 'embedded' ? m.vectors.map(([id]) => id) : []))
      expect(embedded).toEqual(['f1', 'f2'])
      await h.send({ type: 'upsert', items: sixDocs })
      expect(inner.calls.slice(1).flat()).toEqual(['water one', 'water two', 'rock one', 'rock two'])
    })

    it('re-ranks after the first batch and at the end, but at most every 250 ms in between', async () => {
      let now = 0
      const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
      try {
        const h = harness({ embedBatchSize: 1 })
        await h.send({ type: 'watch', query: '' })
        const before = resultsFor(h, '').length
        await h.send({ type: 'upsert', items: sixDocs }) // the clock never moves: batches 2–5 are within the throttle
        expect(resultsFor(h, '').length - before).toBe(2) // after batch 1, and at the end
      } finally {
        clock.mockRestore()
      }
    })

    it('does not let clicks mid-job hold back the job’s re-ranks', async () => {
      let now = 0
      const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
      try {
        const embedder = steppedEmbedder()
        const h = harness({ embedder, embedBatchSize: 1 })
        await h.send({ type: 'watch', query: '' })
        h.dispatch({ type: 'upsert', items: sixDocs })
        await vi.waitFor(() => expect(embedder.calls).toHaveLength(1))
        embedder.release() // batch 1 applies at t=0 and ranks (first batch)
        await vi.waitFor(() => expect(embedder.calls).toHaveLength(2))
        now = 300
        h.dispatch({ type: 'interact', id: 'f1', kind: 'open' }) // a click at t=300 ranks too
        await vi.waitFor(() => expect(h.last('results')?.result.interests.map((i) => i.id)).toEqual(['f1']))
        const before = resultsFor(h, '').length
        embedder.release() // batch 2 applies at t=300: 300 ms since the job last ranked, so it ranks
        await vi.waitFor(() => expect(embedder.calls).toHaveLength(3))
        expect(resultsFor(h, '').length).toBe(before + 1)
      } finally {
        clock.mockRestore()
      }
    })

    it('ends the job when an apply step throws, so a later upsert still gets embedded', async () => {
      let broken = true
      const h = harness({
        embedBatchSize: 2,
        score: (input) => {
          if (broken && input.hasVector) throw new Error('bad scorer')
          return defaultScorer(input)
        },
      })
      await h.send({ type: 'watch', query: '' })
      await h.send({ type: 'upsert', items: sixDocs }) // idle() must resolve, not spin
      expect(h.last('error')!.message).toBe('bad scorer')
      expect(progressOf(h).at(-1)).toEqual([6, 6]) // the broken job's progress ends, so `embedding` clears
      broken = false
      await h.send({ type: 'upsert', items: [{ id: 'n1', text: 'fire new' }] })
      expect(h.embedder.calls.at(-1)).toContain('fire new')
      expect(progressOf(h).at(-1)).toEqual([1, 1])
    })

    it('treats an embedBatchSize below 1 or not a number as usable', async () => {
      for (const embedBatchSize of [0, -3, Number.NaN]) {
        const h = harness({ embedBatchSize })
        await h.send({ type: 'upsert', items: sixDocs })
        expect(progressOf(h).at(-1)).toEqual([6, 6])
      }
    })
  })
})
