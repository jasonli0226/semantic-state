import { describe, expect, it } from 'vitest'
import { prebuiltSource } from './source.ts'

const articles = [
  { id: 1, title: 'Moon', topic: 'Science', abstract: 'A satellite.', url: 'https://en.wikipedia.org/wiki/Moon' },
  { id: 2, title: 'Sun', topic: 'Science', abstract: 'A star.', url: 'https://en.wikipedia.org/wiki/Sun' },
]

type Files = Record<string, unknown>

/** Minimal fetch: JSON bodies for .json, ArrayBuffer for .bin, 404 for anything else. */
const fakeFetch = (files: Files) =>
  (async (input: string | URL | Request) => {
    const name = String(input).split('/').at(-1)!
    const body = files[name]
    if (body === undefined) return { ok: false, status: 404 } as Response
    return { ok: true, status: 200, json: async () => body, arrayBuffer: async () => body } as unknown as Response
  }) as typeof fetch

const vectors = new Float32Array([1, 0, 0, 1]).buffer
const base: Files = {
  'articles.json': articles,
  'meta.json': { ids: [1, 2], dims: 2 },
  'vectors.bin': vectors,
  'layout.json': { ids: [1, 2], x: [-10, 10], y: [0, 5.5] },
}
const load = (overrides: Files) => prebuiltSource('/wiki/', fakeFetch({ ...base, ...overrides })).load()

describe('prebuiltSource', () => {
  it('loads articles with their vector and map position', async () => {
    const loaded = await load({})
    expect(loaded.articles.map((a) => a.title)).toEqual(['Moon', 'Sun'])
    expect(loaded.vectors?.map(([id, v]) => [id, [...v]])).toEqual([[1, [1, 0]], [2, [0, 1]]])
    expect(loaded.positions).toEqual(new Map([[1, { x: -10, y: 0 }], [2, { x: 10, y: 5.5 }]]))
  })

  it('names the file that failed to load', async () => {
    await expect(load({ 'vectors.bin': undefined })).rejects.toThrow('Could not load vectors.bin (HTTP 404)')
    await expect(load({ 'layout.json': undefined })).rejects.toThrow('Could not load layout.json (HTTP 404)')
  })

  it('rejects articles without a vector', async () => {
    await expect(load({ 'meta.json': { ids: [1], dims: 4 } })).rejects.toThrow('vectors.bin has no vector for 1 articles (e.g. Sun)')
  })

  it('rejects a vector file of the wrong size', async () => {
    await expect(load({ 'meta.json': { ids: [1, 2], dims: 3 } })).rejects.toThrow('Invalid vector file: expected 24 bytes, got 16')
  })

  it('rejects malformed meta.json', async () => {
    await expect(load({ 'meta.json': { ids: 'nope' } })).rejects.toThrow(/Invalid meta\.json/)
  })

  it('rejects malformed layout.json', async () => {
    await expect(load({ 'layout.json': { ids: [1, 2], x: [0], y: [0, 0] } })).rejects.toThrow(/Invalid layout\.json/)
    await expect(load({ 'layout.json': { ids: [1, 2], x: [0, 'a'], y: [0, 0] } })).rejects.toThrow(/Invalid layout\.json/)
  })

  it('rejects articles without a position (layout from an older build)', async () => {
    await expect(load({ 'layout.json': { ids: [1, 3], x: [0, 1], y: [0, 1] } })).rejects.toThrow('layout.json has no position for 1 articles (e.g. Sun)')
  })
})
