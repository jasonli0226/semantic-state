import type { Belief, Reason } from 'semantic-state'
import { describe, expect, it } from 'vitest'
import type { Article } from '../types.ts'
import { DOT_RADIUS, MAX_RADIUS, MIN_RADIUS, assignLanes, encode, sameVisual } from './encoding.ts'

const article: Article = { id: 3, title: 'Earth', topic: 'Science', abstract: 'A planet.', url: 'https://en.wikipedia.org/wiki/Earth' }
const belief = (confidence: number, reason: Reason): Belief<Article> => ({ value: article, confidence, reason, groupExtras: 0, updatedAt: 1 })
const ctx = { query: 'planets', lanes: new Map([[1, 2]]), titleOf: (id: number | string) => (id === 1 ? 'Moon' : `#${id}`) }

describe('encode', () => {
  it('draws an interacted article as an anchor in its own lane, ring = interest weight', () => {
    expect(encode(1, { interestWeight: 0.56 }, ctx)).toEqual({
      radius: MAX_RADIUS,
      tone: 'lane-2',
      ring: 0.56,
      why: 'You clicked this · interest weight 0.56, fading with each new click',
    })
  })

  it('colours an interest match by the lane of the article it is like', () => {
    expect(encode(3, { belief: belief(0.5, { kind: 'interest', becauseOf: 1 }) }, ctx)).toEqual({
      radius: MIN_RADIUS + 10,
      tone: 'lane-2',
      ring: 0,
      why: 'Confidence 0.50 · because you clicked Moon',
    })
  })

  it('marks a query match with the search tone and quotes the query', () => {
    const v = encode(3, { belief: belief(1, { kind: 'search', becauseOf: null }) }, ctx)
    expect(v).toMatchObject({ radius: MAX_RADIUS, tone: 'search' })
    expect(v.why).toBe('Confidence 1.00 · matches “planets”')
  })

  it('mutes fallback and unranked nodes', () => {
    expect(encode(3, { belief: belief(0, { kind: 'fallback', becauseOf: null }) }, ctx)).toMatchObject({ radius: MIN_RADIUS, tone: 'muted' })
    expect(encode(3, {}, ctx)).toEqual({ radius: DOT_RADIUS, tone: 'muted', ring: 0, why: 'Not in the current ranking' })
  })
})

describe('assignLanes', () => {
  it('keeps existing lanes and gives new interests the lowest free lane', () => {
    const lanes = assignLanes(new Map([[10, 0], [11, 1]]), [11, 12], 6)
    expect([...lanes]).toEqual([[11, 1], [12, 0]])
  })

  it('returns the same map when nothing changed', () => {
    const lanes = new Map([[10, 0]])
    expect(assignLanes(lanes, [10], 6)).toBe(lanes)
  })
})

describe('sameVisual', () => {
  it('compares what is drawn, not the explanation', () => {
    const v = { radius: 10, tone: 'search' as const, ring: 0, why: 'a' }
    expect(sameVisual(v, { ...v, why: 'b' })).toBe(true)
    expect(sameVisual(v, { ...v, radius: 11 })).toBe(false)
  })
})
