import type { Id, Vec } from 'semantic-state'
import { decodeVectorFile } from 'semantic-state/worker'
import { z } from 'zod'
import { parseArticles } from './data.ts'
import type { Article } from './types.ts'

/**
 * Where articles come from. The UI only sees this interface, so a later source that fetches live from
 * Wikipedia (no vectors → the worker embeds) can replace the prebuilt one without touching the graph.
 */
export interface LoadedArticles {
  readonly articles: readonly Article[]
  /** Precomputed text embeddings; omit to have the worker embed the articles. */
  readonly vectors?: readonly (readonly [Id, Vec])[]
}

export interface ArticleSource {
  load(): Promise<LoadedArticles>
}

const MetaSchema = z.object({ ids: z.array(z.number().int()), dims: z.number().int().positive() })

/** Articles and vectors built by scripts/build-wiki.ts, served from `baseUrl` (e.g. `/wiki/`). */
export function prebuiltSource(baseUrl: string, fetcher: typeof fetch = fetch): ArticleSource {
  const get = async (file: string) => {
    const response = await fetcher(`${baseUrl}${file}`)
    if (!response.ok) throw new Error(`Could not load ${file} (HTTP ${response.status})`)
    return response
  }
  return {
    async load() {
      const [articlesFile, metaFile, vectorsFile] = await Promise.all(['articles.json', 'meta.json', 'vectors.bin'].map(get))
      const articles = parseArticles(await articlesFile.json())
      const meta = MetaSchema.safeParse(await metaFile.json())
      if (!meta.success) throw new Error(`Invalid meta.json: ${meta.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
      const vectors = decodeVectorFile(await vectorsFile.arrayBuffer(), meta.data)
      const missing = articles.filter((a) => !vectors.has(a.id))
      if (missing.length > 0) throw new Error(`vectors.bin has no vector for ${missing.length} articles (e.g. ${missing[0].title})`)
      return { articles, vectors: [...vectors] }
    },
  }
}
