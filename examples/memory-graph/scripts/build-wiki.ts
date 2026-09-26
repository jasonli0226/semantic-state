/**
 * Builds public/wiki/{articles.json, vectors.bin, meta.json} from Wikipedia's Level 3 vital articles.
 *   npm run build:data -w examples/memory-graph
 * Embeddings are computed here, once, with the same model the browser uses for queries —
 * so the page never embeds 1000 texts on load, it only embeds what the user types.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pipeline } from '@huggingface/transformers'
import { EMBEDDING_MODEL, REPO_URL } from '../src/config.ts'
import { embeddingTextFor, parseArticles } from '../src/data.ts'
import { type ExtractResponse, parseVitalList, toArticles } from '../src/wiki.ts'

const API = 'https://en.wikipedia.org/w/api.php'
const LIST_PAGE = 'Wikipedia:Vital articles/Level 3'
const CACHE_DIR = 'node_modules/.cache/wiki'
const OUT_DIR = 'public/wiki'
const TITLES_PER_REQUEST = 20
const BATCH = 32
const MIN_ARTICLES = 950
const USER_AGENT = `semantic-state-example/0.1 (${REPO_URL})`

/** One request at a time, cached on disk, so rebuilds don't hit Wikipedia again. */
async function api(params: Record<string, string>): Promise<unknown> {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
  const cached = `${CACHE_DIR}/${createHash('sha256').update(url).digest('hex')}.json`
  const hit = await readFile(cached, 'utf8').catch(() => null)
  if (hit !== null) return JSON.parse(hit)
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`Wikipedia API → HTTP ${response.status} for ${url}`)
  const body: unknown = await response.json()
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(cached, JSON.stringify(body))
  return body
}

const list = (await api({ action: 'parse', page: LIST_PAGE, prop: 'wikitext' })) as { parse: { wikitext: string } }
const entries = parseVitalList(list.parse.wikitext)

const responses: ExtractResponse[] = []
for (let i = 0; i < entries.length; i += TITLES_PER_REQUEST) {
  const titles = entries.slice(i, i + TITLES_PER_REQUEST).map((e) => e.title).join('|')
  const params = { action: 'query', prop: 'extracts|info', exintro: '1', explaintext: '1', exlimit: 'max', inprop: 'url', redirects: '1', titles }
  responses.push((await api(params)) as ExtractResponse)
}

// Same validation the browser runs: fail the build instead of shipping bad data.
const articles = parseArticles(toArticles(entries, responses))
if (articles.length < MIN_ARTICLES) throw new Error(`Only ${articles.length} of ${entries.length} articles resolved (need ${MIN_ARTICLES})`)

const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' })
const texts = articles.map(embeddingTextFor)
const chunks: Float32Array[] = []
let dims = 0
for (let i = 0; i < texts.length; i += BATCH) {
  const tensor = await extractor(texts.slice(i, i + BATCH), { pooling: 'mean', normalize: true })
  dims = tensor.dims[1]
  chunks.push(tensor.data as Float32Array)
}
const vectors = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
chunks.reduce((offset, chunk) => (vectors.set(chunk, offset), offset + chunk.length), 0)

const source = `Wikipedia: ${LIST_PAGE}, intros via the MediaWiki extracts API`
await mkdir(OUT_DIR, { recursive: true })
await writeFile(`${OUT_DIR}/articles.json`, JSON.stringify(articles))
await writeFile(`${OUT_DIR}/vectors.bin`, new Uint8Array(vectors.buffer))
await writeFile(`${OUT_DIR}/meta.json`, `${JSON.stringify({ model: EMBEDDING_MODEL, dtype: 'q8', dims, count: articles.length, source, license: 'CC BY-SA 4.0', ids: articles.map((a) => a.id) })}\n`)
await writeFile(
  `${OUT_DIR}/LICENSE.md`,
  `# Data licence\n\nThe article titles and abstracts in \`articles.json\` are from [Wikipedia](https://en.wikipedia.org/), ` +
    `licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Each entry's \`url\` links its source ` +
    `article and edit history. \`vectors.bin\` holds embeddings derived from that text under the same licence.\n\n` +
    `The code in this example is MIT-licensed (see the repository's LICENSE).\n`,
)
process.stdout.write(`${articles.length} of ${entries.length} articles · ${dims} dims · vectors ${(vectors.byteLength / 1e6).toFixed(1)} MB\n`)
