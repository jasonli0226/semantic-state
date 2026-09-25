import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeVectorFile, fetchVectorFile } from './embedder.ts'

const buffer = new Float32Array([1, 2, 3, 4, 5, 6]).buffer

describe('decodeVectorFile', () => {
  it('splits a Float32 buffer into vectors keyed by id, in order', () => {
    const vectors = decodeVectorFile(buffer, { ids: [10, 'b'], dims: 3 })
    expect(Array.from(vectors.get('b')!)).toEqual([4, 5, 6])
    expect(Array.from(vectors.get(10)!)).toEqual([1, 2, 3])
  })

  it('rejects a buffer whose size does not match the metadata', () => {
    expect(() => decodeVectorFile(new Float32Array(5).buffer, { ids: [1, 2], dims: 3 })).toThrow(/expected 24 bytes, got 20/)
  })
})

describe('fetchVectorFile', () => {
  afterEach(() => vi.unstubAllGlobals())

  const serve = (routes: Record<string, Response>) =>
    vi.stubGlobal('fetch', vi.fn(async (url: string) => routes[url] ?? new Response(null, { status: 404 })))

  it('loads metadata and vectors', async () => {
    serve({ '/m.json': Response.json({ ids: [1, 2], dims: 3 }), '/v.bin': new Response(buffer) })
    const vectors = await fetchVectorFile('/v.bin', '/m.json')
    expect([...vectors.keys()]).toEqual([1, 2])
  })

  it('rejects malformed metadata', async () => {
    serve({ '/m.json': Response.json({ ids: 'nope', dims: 3 }), '/v.bin': new Response(buffer) })
    await expect(fetchVectorFile('/v.bin', '/m.json')).rejects.toThrow(/Invalid vector meta/)
  })

  it('reports HTTP failures with the URL', async () => {
    serve({ '/m.json': Response.json({ ids: [1], dims: 3 }) })
    await expect(fetchVectorFile('/v.bin', '/m.json')).rejects.toThrow('Could not load /v.bin (HTTP 404)')
  })
})
