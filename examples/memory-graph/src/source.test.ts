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

describe('prebuiltSource', () => {
  it('loads articles and pairs each with its vector', async () => {
    const loaded = await prebuiltSource('/wiki/', fakeFetch({ 'articles.json': articles, 'meta.json': { ids: [1, 2], dims: 2 }, 'vectors.bin': vectors })).load()
    expect(loaded.articles.map((a) => a.title)).toEqual(['Moon', 'Sun'])
    expect(loaded.vectors?.map(([id, v]) => [id, [...v]])).toEqual([[1, [1, 0]], [2, [0, 1]]])
  })

  it('names the file that failed to load', async () => {
    await expect(prebuiltSource('/wiki/', fakeFetch({ 'articles.json': articles, 'meta.json': { ids: [1, 2], dims: 2 } })).load()).rejects.toThrow('Could not load vectors.bin (HTTP 404)')
  })

  it('rejects articles without a vector', async () => {
    const files = { 'articles.json': articles, 'meta.json': { ids: [1], dims: 4 }, 'vectors.bin': vectors }
    await expect(prebuiltSource('/wiki/', fakeFetch(files)).load()).rejects.toThrow('vectors.bin has no vector for 1 articles (e.g. Sun)')
  })

  it('rejects a vector file of the wrong size', async () => {
    const files = { 'articles.json': articles, 'meta.json': { ids: [1, 2], dims: 3 }, 'vectors.bin': vectors }
    await expect(prebuiltSource('/wiki/', fakeFetch(files)).load()).rejects.toThrow('Invalid vector file: expected 24 bytes, got 16')
  })

  it('rejects malformed meta.json', async () => {
    const files = { 'articles.json': articles, 'meta.json': { ids: 'nope' }, 'vectors.bin': vectors }
    await expect(prebuiltSource('/wiki/', fakeFetch(files)).load()).rejects.toThrow(/Invalid meta\.json/)
  })
})
