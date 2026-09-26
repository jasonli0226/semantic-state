import { z } from 'zod'
import { type Article, TOPICS } from './types.ts'

const ArticleSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  topic: z.enum(TOPICS),
  abstract: z.string().min(1),
  url: z.url(),
})

/** Validates articles.json (fetched at runtime, so treated as untrusted input). */
export function parseArticles(input: unknown): Article[] {
  const result = z.array(ArticleSchema).safeParse(input)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n')
    throw new Error(`Invalid articles.json:\n${issues}`)
  }
  const ids = new Set<number>()
  for (const { id } of result.data) {
    if (ids.has(id)) throw new Error(`Invalid articles.json: duplicate id ${id}`)
    ids.add(id)
  }
  return result.data
}

/** What gets embedded. */
export const embeddingTextFor = (a: Article) => `${a.title}. ${a.abstract}`

export function findSeed(articles: readonly Article[], title: string): Article {
  const seed = articles.find((a) => a.title === title)
  if (!seed) throw new Error(`Seed article "${title}" is not in articles.json`)
  return seed
}
