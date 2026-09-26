import type { FeatureVectors, Vec } from 'semantic-state/core'
import { type Article, TOPICS, type Topic } from './types.ts'

/** One-hot over the Level 3 topics; already unit length. Weighted by the topic slider. */
export function topicVector(topic: Topic): Vec {
  return new Float32Array(TOPICS.map((t) => (t === topic ? 1 : 0)))
}

/** `features` for defineSemanticWorker. */
export function wikiFeatures(articles: readonly Article[]): Map<number, FeatureVectors> {
  return new Map(articles.map((a) => [a.id, { topic: topicVector(a.topic) }]))
}
