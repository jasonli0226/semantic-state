import type { Visual } from '../graph/encoding.ts'
import type { Article } from '../types.ts'

export function NodeDetail({ article, visual }: { article: Article | undefined; visual: Visual | undefined }) {
  return (
    <section className="detail" role="region" aria-label="Article details">
      {article ? (
        <>
          <h2>{article.title}</h2>
          <p className="note">{article.topic}</p>
          <p className="why">{visual?.why ?? 'No longer on the graph'}</p>
          <p>{article.abstract}</p>
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            Read on Wikipedia
          </a>
        </>
      ) : (
        <p className="note">Click an article to see why it looks the way it does.</p>
      )}
    </section>
  )
}
