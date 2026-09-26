import type { Id, Vec } from 'semantic-state'
import { decodeVectorFile } from 'semantic-state/worker'
import { z } from 'zod'
import { parseArticles } from './data.ts'
import type { Point } from './graph/mapLayout.ts'
import type { Article } from './types.ts'

/**
 * Where articles come from. The UI only sees this interface, so a later source that fetches live from
 * Wikipedia (no vectors → the worker embeds) can replace the prebuilt one without touching the graph.
 */
export interface LoadedArticles {
  readonly articles: readonly Article[]
  /** Precomputed text embeddings; omit to have the worker embed the articles. */
  readonly vectors?: readonly (readonly [Id, Vec])[]
  /** Fixed map position per article (scripts/build-layout.ts). */
  readonly positions?: ReadonlyMap<Id, Point>
}

export interface ArticleSource {
  load(): Promise<LoadedArticles>
}

const MetaSchema = z.object({ ids: z.array(z.number().int()), dims: z.number().int().positive() })

const LayoutSchema = z
  .object({ ids: z.array(z.number().int()), x: z.array(z.number()), y: z.array(z.number()) })
  .refine((l) => l.x.length === l.ids.length && l.y.length === l.ids.length, 'ids, x and y must have the same length')

const issues = (error: z.ZodError) => error.issues.map((i) => `${i.path.join('.')} ${i.message}`.trim()).join('; ')

/** Articles and vectors built by scripts/build-wiki.ts, served from `baseUrl` (e.g. `/wiki/`). */
export function prebuiltSource(baseUrl: string, fetcher: typeof fetch = fetch): ArticleSource {
  const get = async (file: string) => {
    const response = await fetcher(`${baseUrl}${file}`)
    if (!response.ok) throw new Error(`Could not load ${file} (HTTP ${response.status})`)
    return response
  }
  return {
    async load() {
      const files = await Promise.all(['articles.json', 'meta.json', 'vectors.bin', 'layout.json'].map(get))
      const [articlesFile, metaFile, vectorsFile, layoutFile] = files
      const articles = parseArticles(await articlesFile.json())
      const meta = MetaSchema.safeParse(await metaFile.json())
      if (!meta.success) throw new Error(`Invalid meta.json: ${issues(meta.error)}`)
      const vectors = decodeVectorFile(await vectorsFile.arrayBuffer(), meta.data)
      const missingVector = articles.filter((a) => !vectors.has(a.id))
      if (missingVector.length > 0) throw new Error(`vectors.bin has no vector for ${missingVector.length} articles (e.g. ${missingVector[0].title})`)
      const layout = LayoutSchema.safeParse(await layoutFile.json())
      if (!layout.success) throw new Error(`Invalid layout.json: ${issues(layout.error)}`)
      const positions = new Map<Id, Point>(layout.data.ids.map((id, i) => [id, { x: layout.data.x[i], y: layout.data.y[i] }]))
      const missingPosition = articles.filter((a) => !positions.has(a.id))
      if (missingPosition.length > 0) throw new Error(`layout.json has no position for ${missingPosition.length} articles (e.g. ${missingPosition[0].title})`)
      return { articles, vectors: [...vectors], positions }
    },
  }
}
