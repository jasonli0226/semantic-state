import type { Id, Vec } from '../core/types.ts'

/** Turns texts into unit-length vectors. Runs inside the worker; may load a model on first use. */
export interface Embedder {
  embed(texts: readonly string[], onProgress: (progress: number) => void): Promise<Vec[]>
}

export interface VectorFileMeta {
  readonly ids: readonly Id[]
  readonly dims: number
}

/** Decodes a Float32 file of `ids.length` vectors of `dims` values, in `ids` order. */
export function decodeVectorFile(buffer: ArrayBuffer, meta: VectorFileMeta): Map<Id, Vec> {
  const expected = meta.ids.length * meta.dims * Float32Array.BYTES_PER_ELEMENT
  if (buffer.byteLength !== expected) throw new Error(`Invalid vector file: expected ${expected} bytes, got ${buffer.byteLength}`)
  const all = new Float32Array(buffer)
  return new Map(meta.ids.map((id, i) => [id, all.slice(i * meta.dims, (i + 1) * meta.dims)]))
}

function isMeta(value: unknown): value is VectorFileMeta {
  if (typeof value !== 'object' || value === null) return false
  const { ids, dims } = value as Record<string, unknown>
  return (
    Array.isArray(ids) &&
    ids.every((id) => typeof id === 'string' || typeof id === 'number') &&
    typeof dims === 'number' &&
    Number.isInteger(dims) &&
    dims > 0
  )
}

/**
 * Loads vectors computed at build time, so items need no embedding on page load.
 * `metaUrl` must serve `{ ids: Id[], dims: number }`.
 */
export async function fetchVectorFile(vectorsUrl: string, metaUrl: string): Promise<Map<Id, Vec>> {
  const load = async (url: string) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`)
    return response
  }
  const [meta, buffer] = await Promise.all([load(metaUrl).then((r) => r.json() as Promise<unknown>), load(vectorsUrl).then((r) => r.arrayBuffer())])
  if (!isMeta(meta)) throw new Error(`Invalid vector meta at ${metaUrl}: expected { ids: (string|number)[], dims: positive integer }`)
  return decodeVectorFile(buffer, meta)
}
