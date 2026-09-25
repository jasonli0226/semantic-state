import { describe, expect, it } from 'vitest'
import { ARRIVALS, DEMO_NOW, groundTruth, initialItems } from './dataset.ts'

const all = [...initialItems, ...Object.values(ARRIVALS)]

describe('dataset', () => {
  it('has unique ids', () => {
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length)
  })

  it('has at least 5 relevant items per phase so precision@5 can reach 1', () => {
    expect(groundTruth.payments.size).toBeGreaterThanOrEqual(5)
    expect(groundTruth.hiring.size).toBeGreaterThanOrEqual(5)
  })

  it('only references real items in ground truth', () => {
    const ids = new Set(all.map((i) => i.id))
    for (const set of Object.values(groundTruth)) for (const id of set) expect(ids.has(id)).toBe(true)
  })

  it('seeds the traps the demo relies on', () => {
    const byId = new Map(all.map((i) => [i.id, i]))
    expect(byId.get('pay-stripe-webhook')?.labels).toEqual([])
    expect(byId.get('noise-allhands')?.labels).toContain('priority:high')
    expect(byId.get('noise-spam')?.title).toMatch(/urgent/i)
    expect(groundTruth.payments.has('pay-stripe-webhook')).toBe(true)
    expect(groundTruth.payments.has('noise-allhands')).toBe(false)
  })

  it('keeps items created before the demo clock', () => {
    for (const item of initialItems) expect(item.createdAt).toBeLessThanOrEqual(DEMO_NOW)
  })

  it('does not leak ground-truth fields into items', () => {
    for (const item of all) expect(Object.keys(item).sort()).toEqual(['body', 'createdAt', 'dueAt', 'id', 'labels', 'sender', 'source', 'title'])
  })
})
