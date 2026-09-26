/** Top-level headings of Wikipedia:Vital articles/Level 3, in page order. */
export const TOPICS = [
  'People',
  'History',
  'Geography',
  'Arts',
  'Everyday life',
  'Philosophy and religion',
  'Society and social sciences',
  'Health, medicine and disease',
  'Science',
  'Technology',
  'Mathematics',
] as const

export type Topic = (typeof TOPICS)[number]

export interface Article {
  /** Wikipedia page id. */
  readonly id: number
  readonly title: string
  readonly topic: Topic
  /** First sentences of the article's intro, plain text. */
  readonly abstract: string
  readonly url: string
}

/** Feature weights (semantic-state feature names). `topic` is the one-hot topic vector. */
export type TopicWeights = { readonly text: number; readonly topic: number }

export const DEFAULT_WEIGHTS: TopicWeights = { text: 1, topic: 0 }
