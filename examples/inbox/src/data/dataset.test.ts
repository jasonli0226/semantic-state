import { describe, expect, it } from 'vitest'
import { ARRIVALS, DEMO_NOW, groundTruth, initialItems, parseDataset } from './dataset.ts'

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

describe('parseDataset', () => {
  const valid = {
    demoNow: '2026-09-28T01:00:00.000Z',
    items: [{ id: 'a', topic: 'payments', actionable: true, source: 'ci', sender: 's', title: 't', body: '', labels: [], ageHours: 2, dueInHours: 5 }],
    arrivals: {},
  }

  it('converts relative hours to timestamps and splits out ground truth', () => {
    const parsed = parseDataset(valid)
    const now = Date.parse(valid.demoNow)
    expect(parsed.items[0]).toEqual({ id: 'a', source: 'ci', sender: 's', title: 't', body: '', labels: [], dueAt: now + 5 * 3_600_000, createdAt: now - 2 * 3_600_000 })
    expect(parsed.groundTruth.payments.has('a')).toBe(true)
  })

  it('rejects an unknown source with a readable message', () => {
    const bad = { ...valid, items: [{ ...valid.items[0], source: 'fax' }] }
    expect(() => parseDataset(bad)).toThrow(/inbox\.json.*items\.0\.source/s)
  })

  it('rejects duplicate ids', () => {
    expect(() => parseDataset({ ...valid, items: [valid.items[0], valid.items[0]] })).toThrow(/duplicate id "a"/)
  })

  it('rejects an invalid demo clock', () => {
    expect(() => parseDataset({ ...valid, demoNow: 'monday' })).toThrow(/demoNow/)
  })
})
