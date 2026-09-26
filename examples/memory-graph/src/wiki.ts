import { type Article, TOPICS, type Topic } from './types.ts'

/**
 * Parsing for scripts/build-wiki.ts: the Level 3 vital-articles list and the MediaWiki extracts API.
 * Pure functions, so they're unit-tested without the network.
 */

export interface VitalEntry {
  readonly title: string
  readonly topic: Topic
}

/** `=Level 3 vital articles=` — the list starts after this level-1 heading. */
const LIST_HEADING = /^=[^=].*[^=]=\s*$/
const TOPIC_HEADING = /^==([^=].*?)==\s*$/
/** First wiki link that isn't namespaced (`[[:Category:…]]`, `[[File:…]]`). */
const ARTICLE_LINK = /\[\[([^\]|:][^\]|]*)(?:\|[^\]]*)?\]\]/

const isTopic = (name: string): name is Topic => (TOPICS as readonly string[]).includes(name)

export function parseVitalList(wikitext: string): VitalEntry[] {
  const entries: VitalEntry[] = []
  const seen = new Set<string>()
  let started = false
  let topic: Topic | null = null
  for (const line of wikitext.split('\n')) {
    if (LIST_HEADING.test(line)) {
      started = true
      continue
    }
    if (!started) continue
    const heading = TOPIC_HEADING.exec(line)
    if (heading) {
      const name = heading[1].trim()
      if (!isTopic(name)) throw new Error(`Unknown topic heading: "${name}"`)
      topic = name
      continue
    }
    const link = line.startsWith('*') && topic !== null ? ARTICLE_LINK.exec(line) : null
    if (!link || topic === null) continue
    const title = link[1].trim()
    if (seen.has(title)) continue
    seen.add(title)
    entries.push({ title, topic })
  }
  return entries
}

const SENTENCE_END = /(?<=[.!?])\s+(?=[A-Z0-9"“(])/

export function firstSentences(text: string, n: number): string {
  const clean = text.replace(/\(\s*[;,]?\s*\)/g, '').replace(/\s+/g, ' ').replace(/\s+([.,;])/g, '$1').trim()
  return clean.split(SENTENCE_END).slice(0, n).join(' ')
}

interface Rename {
  readonly from: string
  readonly to: string
}

export interface ExtractResponse {
  readonly query?: {
    readonly normalized?: readonly Rename[]
    readonly redirects?: readonly Rename[]
    readonly pages: readonly {
      readonly pageid?: number
      readonly title: string
      readonly missing?: boolean
      readonly extract?: string
      readonly fullurl?: string
    }[]
  }
}

const articleUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`

/** Joins list entries with API pages (through normalizations and redirects). Missing pages and duplicates are skipped. */
export function toArticles(entries: readonly VitalEntry[], responses: readonly ExtractResponse[], sentences = 3): Article[] {
  const renames = new Map(responses.flatMap((r) => [...(r.query?.normalized ?? []), ...(r.query?.redirects ?? [])]).map((x) => [x.from, x.to]))
  const pages = new Map(responses.flatMap((r) => r.query?.pages ?? []).map((p) => [p.title, p]))
  const resolve = (title: string) => {
    let current = title
    for (let hop = 0; hop < 3 && renames.has(current); hop += 1) current = renames.get(current)!
    return current
  }
  const seen = new Set<number>()
  return entries.flatMap((entry): Article[] => {
    const page = pages.get(resolve(entry.title))
    const extract = page?.extract?.trim()
    if (!page || page.missing || page.pageid === undefined || !extract || seen.has(page.pageid)) return []
    seen.add(page.pageid)
    return [{ id: page.pageid, title: page.title, topic: entry.topic, abstract: firstSentences(extract, sentences), url: page.fullurl ?? articleUrl(page.title) }]
  })
}
