import { describe, expect, it } from 'vitest'
import { collapseDuplicates, groupDuplicates } from './dedupe.ts'
import { normalize } from './vector.ts'
import type { Vec } from './types.ts'

const vectors = new Map<string, Vec>([
  ['a', normalize(new Float32Array([1, 0.05, 0]))],
  ['b', normalize(new Float32Array([1, 0, 0.05]))],
  ['c', normalize(new Float32Array([0, 1, 0]))],
  ['d', normalize(new Float32Array([0, 0, 1]))],
])

describe('groupDuplicates', () => {
  it('groups near-identical items, highest-ranked first', () => {
    expect(groupDuplicates(['b', 'c', 'a', 'd'], (id) => vectors.get(id), 0.9)).toEqual([['b', 'a']])
  })

  it('returns nothing when all items are distinct', () => {
    expect(groupDuplicates(['c', 'd'], (id) => vectors.get(id), 0.9)).toEqual([])
  })

  it('only scans the first `limit` ids', () => {
    expect(groupDuplicates(['a', 'c', 'b'], (id) => vectors.get(id), 0.9, 2)).toEqual([])
  })

  it('skips ids without vectors', () => {
    expect(groupDuplicates(['a', 'zzz', 'b'], (id) => vectors.get(id), 0.9)).toEqual([['a', 'b']])
  })
})

describe('collapseDuplicates', () => {
  it('keeps the representative of each group and drops the rest', () => {
    expect(collapseDuplicates(['a', 'x', 'b', 'c', 'y'], [['a', 'b', 'c']])).toEqual(['a', 'x', 'y'])
  })

  it('returns the order untouched without groups', () => {
    expect(collapseDuplicates(['a', 'b'], [])).toEqual(['a', 'b'])
  })
})
