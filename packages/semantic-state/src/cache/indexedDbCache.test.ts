// @vitest-environment node
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearVectorCache, indexedDbVectorCache } from './indexedDbCache.ts'

const v = (...xs: number[]) => new Float32Array(xs)

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Writes a raw row, bypassing the cache (to plant malformed values). */
async function putRaw(row: object) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('semantic-state', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('vectors', { keyPath: ['model', 'id'] })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('vectors', 'readwrite')
    tx.objectStore('vectors').put(row)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() // a fresh, empty browser profile per test
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('indexedDbVectorCache', () => {
  it('round-trips string and number ids', async () => {
    const cache = indexedDbVectorCache({ model: 'm' })
    await cache.set([['a', 'fire', v(1, 0)], [7, 'water', v(0, 1)]])
    const hits = await cache.get([['a', 'fire'], [7, 'water'], ['b', 'rock']])
    expect([...hits.keys()]).toEqual(['a', 7])
    expect(hits.get('a')).toEqual(v(1, 0))
    expect(hits.get(7)).toEqual(v(0, 1))
  })

  it('is read back by a new instance with the same name (a reload)', async () => {
    await indexedDbVectorCache({ model: 'm' }).set([['a', 'fire', v(1, 0)]])
    const hits = await indexedDbVectorCache({ model: 'm' }).get([['a', 'fire']])
    expect(hits.get('a')).toEqual(v(1, 0))
  })

  it('misses when the text changed, and a new write replaces the entry', async () => {
    const cache = indexedDbVectorCache({ model: 'm' })
    await cache.set([['a', 'fire', v(1, 0)]])
    expect(await cache.get([['a', 'water']])).toEqual(new Map())
    await cache.set([['a', 'water', v(0, 1)]])
    expect((await cache.get([['a', 'water']])).get('a')).toEqual(v(0, 1))
    expect(await cache.get([['a', 'fire']])).toEqual(new Map())
  })

  it('keeps models apart', async () => {
    const one = indexedDbVectorCache({ model: 'm1' })
    const two = indexedDbVectorCache({ model: 'm2' })
    await one.set([['a', 'fire', v(1, 0)]])
    expect(await two.get([['a', 'fire']])).toEqual(new Map())
    await two.set([['a', 'fire', v(0, 1)]])
    expect((await one.get([['a', 'fire']])).get('a')).toEqual(v(1, 0))
  })

  it('clear() removes only its own model', async () => {
    const one = indexedDbVectorCache({ model: 'm1' })
    const two = indexedDbVectorCache({ model: 'm2' })
    await one.set([['a', 'fire', v(1, 0)]])
    await two.set([['a', 'fire', v(0, 1)]])
    await one.clear()
    expect(await one.get([['a', 'fire']])).toEqual(new Map())
    expect((await two.get([['a', 'fire']])).get('a')).toEqual(v(0, 1))
  })

  it('clearVectorCache removes every model', async () => {
    const one = indexedDbVectorCache({ model: 'm1' })
    const two = indexedDbVectorCache({ model: 'm2' })
    await one.set([['a', 'fire', v(1, 0)]])
    await two.set([['a', 'fire', v(0, 1)]])
    await clearVectorCache()
    expect(await one.get([['a', 'fire']])).toEqual(new Map())
    expect(await two.get([['a', 'fire']])).toEqual(new Map())
  })

  it('treats a malformed stored vector as a miss', async () => {
    await putRaw({ model: 'm', id: 'a', hash: await sha256('fire'), vector: [1, 0] })
    expect(await indexedDbVectorCache({ model: 'm' }).get([['a', 'fire']])).toEqual(new Map())
  })

  it('does not open the database for an empty lookup', async () => {
    const open = vi.spyOn(indexedDB, 'open')
    expect(await indexedDbVectorCache({ model: 'm' }).get([])).toEqual(new Map())
    expect(open).not.toHaveBeenCalled()
  })

  it('disables itself and warns once when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cache = indexedDbVectorCache({ model: 'm' })
    await cache.set([['a', 'fire', v(1, 0)]])
    expect(await cache.get([['a', 'fire']])).toEqual(new Map())
    await cache.clear()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('[semantic-state] vector cache disabled')
  })

  it('clearVectorCache rejects when IndexedDB is unavailable, so a logout can report it', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(clearVectorCache()).rejects.toThrow('IndexedDB is not available')
  })
  it('closes its connection when another tab deletes the database, then reopens on next use', async () => {
    const cache = indexedDbVectorCache({ model: 'm' })
    await cache.set([['a', 'fire', v(1, 0)]])
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('semantic-state')
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('blocked by the cache connection'))
    })
    expect(await cache.get([['a', 'fire']])).toEqual(new Map())
    await cache.set([['a', 'fire', v(1, 0)]])
    expect((await cache.get([['a', 'fire']])).get('a')).toEqual(v(1, 0))
  })

  it('gives up on an open that never finishes, so the worker is never stuck', async () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(indexedDB, 'open').mockReturnValue({} as IDBOpenDBRequest) // never succeeds, fails or blocks
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const lookup = indexedDbVectorCache({ model: 'm' }).get([['a', 'fire']])
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await lookup).toEqual(new Map())
      expect(warn.mock.calls[0][0]).toContain('[semantic-state] vector cache disabled')
    } finally {
      vi.useRealTimers()
    }
  })
})
