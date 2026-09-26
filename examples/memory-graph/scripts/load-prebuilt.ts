import { readFile } from 'node:fs/promises'
import type { FeatureVectors, Id, Vec } from 'semantic-state/core'
import { decodeVectorFile } from 'semantic-state/worker'
import { parseArticles } from '../src/data.ts'
import { wikiFeatures } from '../src/features.ts'
import type { Article } from '../src/types.ts'

/** Reads the committed data the way the browser does, for scripts (layout build, eval). */
export async function loadPrebuilt(dir = 'public/wiki') {
  const articles: Article[] = parseArticles(JSON.parse(await readFile(`${dir}/articles.json`, 'utf8')))
  const meta = JSON.parse(await readFile(`${dir}/meta.json`, 'utf8'))
  const bin = await readFile(`${dir}/vectors.bin`)
  const text: Map<Id, Vec> = decodeVectorFile(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta)
  const extra = wikiFeatures(articles)
  const features = new Map<Id, FeatureVectors>(articles.map((a) => [a.id, { ...extra.get(a.id), text: text.get(a.id)! }]))
  return { articles, text, features }
}
