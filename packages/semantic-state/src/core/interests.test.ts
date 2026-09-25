import { describe, expect, it } from 'vitest'
import { addInterest, bestInterest, collapseGroups, interleaveLanes, removeInterest } from './interests.ts'
import { similarity } from './similarity.ts'
import type { FeatureVectors, Id, Scored } from './types.ts'

const f = (text: number[], type: number[] = [0]): FeatureVectors => ({ text: new Float32Array(text), type: new Float32Array(type) })
const ids = (xs: readonly { id: Id }[]) => xs.map((x) => x.id)

describe('similarity', () => {
  const a = f([1, 0], [1])
  const b = f([1, 0], [0])
  it('blends named features by weight', () => {
    expect(similarity(a, b, { text: 1 })).toBeCloseTo(1)
    expect(similarity(a, b, { type: 1 })).toBeCloseTo(0)
    expect(similarity(a, b, { text: 1, type: 1 })).toBeCloseTo(0.5)
  })
  it('ignores features missing on either side and returns 0 with no usable weight', () => {
    expect(similarity(a, { text: new Float32Array([1, 0]) }, { text: 1, type: 1 })).toBeCloseTo(1)
    expect(similarity(a, b, { text: 0 })).toBe(0)
  })
})

describe('addInterest / removeInterest', () => {
  it('puts the newest click first at full weight and decays the rest', () => {
    const list = addInterest(addInterest([], 1), 4)
    expect(list[0]).toEqual({ id: 4, weight: 1 })
    expect(list[1]).toEqual({ id: 1, weight: 0.75 })
  })
  it('moves a re-click to the front without duplicating it', () => {
    expect(ids(addInterest(addInterest(addInterest([], 1), 4), 1))).toEqual([1, 4])
  })
  it('forgets old clicks after enough newer ones', () => {
    const list = [1, 2, 3, 4, 5, 6, 7, 8, 9].reduce<ReturnType<typeof addInterest>>((acc, id) => addInterest(acc, id), [])
    expect(list.length).toBeLessThanOrEqual(6)
    expect(ids(list)).not.toContain(1)
  })
  it('respects custom options', () => {
    expect(addInterest(addInterest([], 1), 2, { decay: 0.5, max: 1, minWeight: 0 })).toEqual([{ id: 2, weight: 1 }])
  })
  it('removes one interest', () => {
    expect(ids(removeInterest(addInterest(addInterest([], 1), 4), 1))).toEqual([4])
  })
})

describe('bestInterest', () => {
  const features = new Map<Id, FeatureVectors>([
    [1, f([1, 0])],
    [2, f([0, 1])],
  ])
  it('takes the best weighted match and says which interest it came from', () => {
    const best = bestInterest(f([0, 1]), [{ id: 1, weight: 1 }, { id: 2, weight: 0.5 }], (id) => features.get(id), { text: 1 })
    expect(best).toEqual({ score: 0.5, becauseOf: 2 })
  })
  it('returns null without interests', () => {
    expect(bestInterest(f([1, 0]), [], (id) => features.get(id), { text: 1 })).toBeNull()
  })
})

const s = (id: Id, score: number, becauseOf: Id | null = null): Scored => ({
  id,
  score,
  confidence: 1,
  reason: { kind: becauseOf === null ? 'search' : 'interest', becauseOf },
})

describe('interleaveLanes', () => {
  it('stops the newest interest from taking every slot', () => {
    const out = interleaveLanes([s(1, 0.8, 4), s(2, 0.79, 4), s(3, 0.78, 4), s(5, 0.77, 4), s(8, 0.6, 7), s(9, 0.59, 7)])
    expect(out.slice(0, 4).map((x) => x.reason.becauseOf)).toContain(7)
  })
  it('rewrites scores so they never increase down the list', () => {
    const scores = interleaveLanes([s(1, 0.8, 4), s(2, 0.79, 4), s(3, 0.78, 4), s(8, 0.6, 7)]).map((x) => x.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })
  it('is a no-op for a single lane', () => {
    const one = [s(1, 0.9), s(2, 0.5)]
    expect(interleaveLanes(one)).toEqual(one)
  })
})

describe('collapseGroups', () => {
  it('keeps the best member of each group and counts the rest', () => {
    const family = new Map<Id, Id>([
      [1, 'a'],
      [2, 'a'],
      [3, 'b'],
    ])
    const { ranked, extras } = collapseGroups([s(1, 0.9), s(2, 0.8), s(3, 0.7)], (id) => family.get(id))
    expect(ids(ranked)).toEqual([1, 3])
    expect(extras.get(1)).toBe(1)
  })
  it('treats items without a group as their own group', () => {
    expect(ids(collapseGroups([s(1, 0.9), s(2, 0.8)], () => undefined).ranked)).toEqual([1, 2])
  })
})
