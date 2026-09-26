import { describe, expect, it } from 'vitest'
import { computeMapLayout } from './mapLayout.ts'

/** Two clusters of 12, strongly linked inside, one weak bridge between them. */
function twoClusters() {
  const ids = Array.from({ length: 24 }, (_, i) => i + 1)
  const edges = ids.flatMap((id) => {
    const base = id <= 12 ? 1 : 13
    return [1, 2, 3].map((step) => ({ source: id, target: base + ((id - base + step) % 12), similarity: 0.9 }))
  })
  return { ids, edges: [...edges, { source: 1, target: 13, similarity: 0.2 }] }
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

describe('computeMapLayout', () => {
  it('is deterministic', () => {
    const { ids, edges } = twoClusters()
    expect(computeMapLayout(ids, edges, { ticks: 200 })).toEqual(computeMapLayout(ids, edges, { ticks: 200 }))
  })

  it('puts linked articles closer together than random pairs', () => {
    const { ids, edges } = twoClusters()
    const p = computeMapLayout(ids, edges, { ticks: 300 })
    const linked = median(edges.map((e) => distance(p.get(e.source)!, p.get(e.target)!)))
    const all = median(ids.flatMap((a) => ids.filter((b) => b > a).map((b) => distance(p.get(a)!, p.get(b)!))))
    expect(linked).toBeLessThan(all)
  })

  it('fits the extent on its longer axis and rounds to 0.1', () => {
    const { ids, edges } = twoClusters()
    const points = [...computeMapLayout(ids, edges, { ticks: 200, extent: 500 }).values()]
    const reach = Math.max(...points.map((q) => Math.max(Math.abs(q.x), Math.abs(q.y))))
    expect(reach).toBeGreaterThan(499)
    expect(reach).toBeLessThanOrEqual(500.1)
    // Rounding to 0.1 is idempotent: rounding again changes nothing.
    expect(points.every((q) => Math.round(q.x * 10) / 10 === q.x && Math.round(q.y * 10) / 10 === q.y)).toBe(true)
  })

  it('ignores edges to unknown ids', () => {
    expect([...computeMapLayout([1, 2], [{ source: 1, target: 99, similarity: 1 }], { ticks: 10 }).keys()]).toEqual([1, 2])
  })
})
