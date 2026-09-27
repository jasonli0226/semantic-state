/** Background embedding of the inbox; the semantic list already ranks the items embedded so far. */
export function EmbeddingBanner({ embedding }: { embedding: { done: number; total: number } | null }) {
  if (embedding === null) return null
  return (
    <div className="banner" role="status">
      <span>
        Embedding {embedding.done} of {embedding.total} items on this device — ranking what is ready
      </span>
      <progress max={embedding.total} value={embedding.done} />
    </div>
  )
}
