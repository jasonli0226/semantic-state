import type { Id, Vec } from '../core/types.ts'
import type { VectorCache } from './vectorCache.ts'

export interface IndexedDbVectorCacheOptions {
  /** Part of every key. Pass the same constant the embedder uses: another model under the same name mixes vector spaces. */
  readonly model: string
  /** Database name. Default 'semantic-state'. */
  readonly name?: string
}

interface Row {
  readonly model: string
  readonly id: Id
  /** Hex SHA-256 of the text the vector was computed from. An integrity check, not a secret. */
  readonly hash: string
  readonly vector: Vec
}

const DEFAULT_NAME = 'semantic-state'
const STORE = 'vectors'
const VERSION = 1
/** An open that never settles (blocked, or a browser bug) must not hold up the worker's queue. */
const OPEN_TIMEOUT_MS = 3_000
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const request = <R>(req: IDBRequest<R>) =>
  new Promise<R>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const committed = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })

function openDatabase(name: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available'))
  const req = indexedDB.open(name, VERSION)
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: ['model', 'id'] })
  const opened = request(req)
  return new Promise<IDBDatabase>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`IndexedDB open did not finish within ${OPEN_TIMEOUT_MS} ms`))
      void opened.then((db) => db.close(), () => {}) // too late: don't leak the connection
    }, OPEN_TIMEOUT_MS)
    opened.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Every key of one model: `[model]` sorts before `[model, id]`, and `[model, []]` after it (arrays sort above ids). */
const modelRange = (model: string) => IDBKeyRange.bound([model], [model, []])

const isRow = (value: unknown): value is Row => {
  if (typeof value !== 'object' || value === null) return false
  const { hash, vector } = value as Record<string, unknown>
  return typeof hash === 'string' && vector instanceof Float32Array
}

/**
 * Item vectors in IndexedDB, for `defineSemanticWorker({ vectorCache })`. Stores one entry per (model, id): the
 * vector and a hash of its text, never the text. If the database fails to open, the cache disables itself (one warning).
 */
export function indexedDbVectorCache({ model, name = DEFAULT_NAME }: IndexedDbVectorCacheOptions): VectorCache {
  let opening: Promise<IDBDatabase | null> | null = null
  const database = () =>
    (opening ??= openDatabase(name).then(
      (db) => {
        // Another tab deleting or upgrading the database waits for this connection: let it go, reopen on next use.
        db.onversionchange = () => {
          db.close()
          opening = null
        }
        db.onclose = () => {
          opening = null
        }
        return db
      },
      (error: unknown) => {
        console.warn(`[semantic-state] vector cache disabled: ${errorMessage(error)}`)
        return null
      },
    ))

  return {
    async get(entries) {
      if (entries.length === 0) return new Map()
      const db = await database()
      if (db === null) return new Map()
      const hashes = await Promise.all(entries.map(([, text]) => sha256(text)))
      // One request for the model's whole range: at most one entry per id, and far fewer requests than one per key.
      const rows: unknown[] = await request(db.transaction(STORE, 'readonly').objectStore(STORE).getAll(modelRange(model)))
      const stored = new Map(rows.filter(isRow).map((row) => [row.id, row] as const))
      return new Map(
        entries.flatMap(([id], i) => {
          const row = stored.get(id)
          return row !== undefined && row.hash === hashes[i] ? [[id, row.vector] as const] : []
        }),
      )
    },
    async set(entries) {
      if (entries.length === 0) return
      const db = await database()
      if (db === null) return
      // Hash first: a transaction commits as soon as it has nothing to do, so it cannot wait on crypto.
      const hashes = await Promise.all(entries.map(([, text]) => sha256(text)))
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      entries.forEach(([id, , vector], i) => store.put({ model, id, hash: hashes[i], vector } satisfies Row))
      await committed(tx)
    },
    async clear() {
      const db = await database()
      if (db === null) return
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(modelRange(model))
      await committed(tx)
    },
  }
}

/**
 * Deletes every cached vector in the database (all models), e.g. on logout. Call `store.dispose()` first: it
 * terminates the worker, so no write can land after the clear. Rejects if IndexedDB is unavailable.
 */
export async function clearVectorCache(name: string = DEFAULT_NAME): Promise<void> {
  const db = await openDatabase(name)
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    await committed(tx)
  } finally {
    db.close()
  }
}
