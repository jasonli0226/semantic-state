import { describe, expect, it } from 'vitest'
import { createLayout } from './layout.ts'

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
const edge = (source: number, target: number) => ({ source, target, similarity: 0.6 })

describe('createLayout', () => {
  it('places the first node at the origin and children near their parent', () => {
    const layout = createLayout({ animate: false })
    layout.update([{ id: 1, parent: null }, { id: 2, parent: 1 }, { id: 3, parent: 1 }], [edge(1, 2), edge(1, 3)])
    const p = layout.positions()
    expect(p.get(1)).toBeDefined()
    expect(distance(p.get(1)!, p.get(2)!)).toBeLessThan(250)
    expect(distance(p.get(1)!, p.get(3)!)).toBeLessThan(250)
  })

  it('never moves settled nodes when new ones arrive', () => {
    const layout = createLayout({ animate: false })
    layout.update([{ id: 1, parent: null }, { id: 2, parent: 1 }], [edge(1, 2)])
    const before = layout.positions()
    layout.update([{ id: 1, parent: null }, { id: 2, parent: 1 }, { id: 4, parent: 2 }], [edge(1, 2), edge(2, 4)])
    const after = layout.positions()
    expect(after.get(1)).toEqual(before.get(1))
    expect(after.get(2)).toEqual(before.get(2))
    expect(distance(after.get(2)!, after.get(4)!)).toBeLessThan(250)
  })

  it('drops nodes that are no longer visible and notifies subscribers', () => {
    const layout = createLayout({ animate: false })
    let calls = 0
    layout.subscribe(() => (calls += 1))
    layout.update([{ id: 1, parent: null }, { id: 2, parent: 1 }], [edge(1, 2)])
    layout.update([{ id: 2, parent: null }], [])
    expect([...layout.positions().keys()]).toEqual([2])
    expect(calls).toBeGreaterThan(0)
  })
})
