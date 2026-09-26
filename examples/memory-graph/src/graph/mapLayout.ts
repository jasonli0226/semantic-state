import { type SimulationLinkDatum, type SimulationNodeDatum, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import type { Edge } from './useNeighbors.ts'

/**
 * Fixed map positions for every article: a force layout over the nearest-neighbour graph, so neighbours land
 * close together and meaning forms regions. Run at build time (scripts/build-layout.ts). d3's random source is
 * seeded, so the same input always gives the same map.
 */

export interface Point {
  readonly x: number
  readonly y: number
}

export const MAP_EXTENT = 1000

interface Datum extends SimulationNodeDatum {
  readonly id: number
}

type Link = SimulationLinkDatum<Datum> & { readonly similarity: number }

const round1 = (v: number) => Math.round(v * 10) / 10

export function computeMapLayout(ids: readonly number[], edges: readonly Edge[], { ticks = 600, extent = MAP_EXTENT } = {}): Map<number, Point> {
  const nodes: Datum[] = ids.map((id) => ({ id }))
  const known = new Set(ids)
  const links = edges.filter((e) => known.has(e.source) && known.has(e.target)).map((e): Link => ({ source: e.source, target: e.target, similarity: e.similarity }))
  const simulation = forceSimulation<Datum, Link>(nodes)
    .force('link', forceLink<Datum, Link>(links).id((d) => d.id).distance((l) => 70 + 90 * (1 - l.similarity)))
    .force('charge', forceManyBody<Datum>().strength(-160))
    .force('collide', forceCollide<Datum>(34))
    .force('x', forceX<Datum>(0).strength(0.02))
    .force('y', forceY<Datum>(0).strength(0.02))
    .stop()
  simulation.tick(ticks)

  const xs = nodes.map((n) => n.x ?? 0)
  const ys = nodes.map((n) => n.y ?? 0)
  const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 || 1
  const scale = extent / half
  return new Map(nodes.map((n, i) => [n.id, { x: round1((xs[i] - cx) * scale), y: round1((ys[i] - cy) * scale) }]))
}
