import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base } from '@playwright/test'

/**
 * The embedding model and the onnxruntime wasm come from third-party CDNs, and every test starts with an
 * empty browser profile — so without this, each test downloads them again. Successful GET responses are
 * kept on disk and replayed; CI caches the folder between runs. Range requests are answered with the whole
 * file (a valid reply to a Range request), so one cached copy serves every read.
 */
const CACHE_DIR = process.env.E2E_NET_CACHE ?? 'node_modules/.cache/e2e-net'
const REMOTE = /^https:\/\/(huggingface\.co|cdn\.jsdelivr\.net)\//
// The replayed body is already decoded, so the first three would describe the wrong bytes. The CDN echoes the
// requesting origin, but one cached copy serves both example apps (different ports), so CORS is reset to `*`.
const DROPPED_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'access-control-allow-origin', 'vary'])
const CORS = { 'access-control-allow-origin': '*' }

interface CachedResponse {
  readonly status: number
  readonly headers: Record<string, string>
}

const readCached = async (file: string) => {
  try {
    const meta = JSON.parse(await readFile(`${file}.json`, 'utf8')) as CachedResponse
    return { ...meta, body: await readFile(`${file}.body`) }
  } catch {
    return null
  }
}

// Write-then-rename so a parallel worker never reads a half-written file.
const writeAtomic = async (path: string, data: string | Buffer) => {
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, path)
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await mkdir(CACHE_DIR, { recursive: true })
    await context.route(REMOTE, async (route) => {
      const request = route.request()
      if (request.method() !== 'GET') return route.continue()
      const file = join(CACHE_DIR, createHash('sha256').update(request.url()).digest('hex'))
      const cached = await readCached(file)
      if (cached) return route.fulfill({ ...cached, headers: { ...cached.headers, ...CORS } })

      const { range: _range, ...headers } = request.headers()
      const response = await route.fetch({ headers })
      const body = await response.body()
      if (response.status() === 200) {
        const kept = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => !DROPPED_HEADERS.has(name)))
        await writeAtomic(`${file}.body`, body)
        await writeAtomic(`${file}.json`, JSON.stringify({ status: 200, headers: kept } satisfies CachedResponse))
      }
      return route.fulfill({ response, body })
    })
    await use(context)
  },
})

export { expect } from '@playwright/test'
