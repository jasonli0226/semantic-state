import { dot } from 'semantic-state/core'
import { describe, expect, it } from 'vitest'
import { topicVector, wikiFeatures } from './features.ts'
import { TOPICS, type Article } from './types.ts'

const article = (id: number, topic: Article['topic']): Article => ({ id, title: `A${id}`, topic, abstract: 'x', url: 'https://en.wikipedia.org/wiki/X' })

describe('topicVector', () => {
  it('is a unit one-hot vector over the 11 topics', () => {
    const v = topicVector('Science')
    expect(v).toHaveLength(TOPICS.length)
    expect(dot(v, v)).toBe(1)
    expect(v[TOPICS.indexOf('Science')]).toBe(1)
  })

  it('makes same-topic articles similar (1) and others orthogonal (0)', () => {
    expect(dot(topicVector('Arts'), topicVector('Arts'))).toBe(1)
    expect(dot(topicVector('Arts'), topicVector('History'))).toBe(0)
  })
})

describe('wikiFeatures', () => {
  it('gives every article a topic feature keyed by id', () => {
    const features = wikiFeatures([article(1, 'Arts'), article(2, 'Science')])
    expect([...features.keys()]).toEqual([1, 2])
    expect(features.get(2)?.topic).toEqual(topicVector('Science'))
  })
})
