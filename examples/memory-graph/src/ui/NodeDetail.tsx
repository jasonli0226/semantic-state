import type { Visual } from '../graph/encoding.ts'
import type { Article } from '../types.ts'

interface Neighbour {
  readonly id: number
  readonly title: string
  readonly similarity: number
}

interface Props {
  readonly article: Article | undefined
  readonly visual: Visual | undefined
  readonly neighbours: readonly Neighbour[]
  readonly onActivate: (id: number) => void
}

/** The selected article, why it looks the way it does, and its nearest articles — the non-spatial way through the map. */
export function NodeDetail({ article, visual, neighbours, onActivate }: Props) {
  if (!article) {
    return (
      <section className="detail" role="region" aria-label="Article details">
        <p className="note">Click an article to see why it looks the way it does.</p>
      </section>
    )
  }
  return (
    <section className="detail" role="region" aria-label="Article details">
      <h2>{article.title}</h2>
      <p className="note">{article.topic}</p>
      <p className="why">{visual?.why ?? 'Not in the current ranking'}</p>
      <p>{article.abstract}</p>
      <a href={article.url} target="_blank" rel="noopener noreferrer">
        Read on Wikipedia
      </a>
      <h3>Nearest articles</h3>
      {neighbours.length === 0 ? (
        <p className="note">Finding nearest articles…</p>
      ) : (
        <ul className="neighbours">
          {neighbours.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => onActivate(n.id)}>
                {n.title} <span className="note">{n.similarity.toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
