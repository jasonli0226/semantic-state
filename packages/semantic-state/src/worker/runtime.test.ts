import { describe, expect, it } from 'vitest'
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
function fakeEmbedder(opts: { fail?: boolean } = {}): Embedder & { calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    async embed(texts, onProgress) {
      calls.push([...texts])
      onProgress(0.5)
      if (opts.fail) throw new Error('offline')
      return texts.map((t) => new Float32Array(t.includes('fire') ? [1, 0, 0] : t.includes('water') ? [0, 1, 0] : [0, 0, 1]))
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
  const send = async (m: ToWorker<Doc>) => {
    listener?.({ data: m } as MessageEvent<ToWorker<Doc>>)
    await runtime.idle()
  }
  const last = <K extends FromWorker<Doc>['type']>(type: K) =>
    out.filter((m): m is Extract<FromWorker<Doc>, { type: K }> => m.type === type).at(-1)
  return { out, send, last, embedder, runtime }
}

const docs: Doc[] = [
  { id: 'a', text: 'fire lizard', group: 'g1' },
  { id: 'b', text: 'fire dragon', group: 'g1' },
  { id: 'c', text: 'water turtle', group: 'g2' },
  { id: 'd', text: 'rock snake', group: 'g3' },
]

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
})
