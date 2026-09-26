import { type SimulationLinkDatum, type SimulationNodeDatum, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import type { VisibleNode } from './explored.ts'
import type { Edge } from './useNeighbors.ts'

/**
 * Positions for the graph. d3-force mutates its node objects in place, so this module owns them and only
 * hands out immutable snapshots. Settled nodes are pinned: attention changes size and colour, never position,
 * and new nodes spawn next to the node that expanded them.
 */

export interface Point {
  readonly x: number
  readonly y: number
}

export type Positions = ReadonlyMap<number, Point>

export interface Layout {
  update(nodes: readonly VisibleNode[], edges: readonly Edge[]): void
  /** Run the simulation to rest synchronously (reduced motion, tests). */
  settle(): void
  positions(): Positions
  subscribe(listener: () => void): () => void
  stop(): void
}

interface Datum extends SimulationNodeDatum {
  readonly id: number
}

type Link = SimulationLinkDatum<Datum> & { readonly similarity: number }

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const SPAWN_DISTANCE = 70
const LINK_DISTANCE = { base: 70, span: 90 }
const CHARGE = -160
const COLLIDE_RADIUS = 34

export function createLayout({ animate }: { animate: boolean }): Layout {
  let data = new Map<number, Datum>()
  let snapshot: Positions = new Map()
  let spawned = 0
  const listeners = new Set<() => void>()

  const publish = () => {
    snapshot = new Map([...data].map(([id, d]) => [id, { x: d.x ?? 0, y: d.y ?? 0 }]))
    for (const listener of listeners) listener()
  }
  const pinAll = () => {
    for (const d of data.values()) {
      d.fx = d.x
      d.fy = d.y
    }
  }
  const simulation = forceSimulation<Datum, Link>()
    .force('charge', forceManyBody<Datum>().strength(CHARGE))
    .force('collide', forceCollide<Datum>(COLLIDE_RADIUS))
    .stop()
  simulation.on('tick', publish).on('end', () => {
    pinAll()
    publish()
  })

  const spawn = (node: VisibleNode, placed: ReadonlyMap<number, Datum>): Datum => {
    const parent = node.parent === null ? undefined : placed.get(node.parent)
    const angle = spawned * GOLDEN_ANGLE
    const distance = parent ? SPAWN_DISTANCE : spawned === 0 ? 0 : SPAWN_DISTANCE * 2
    spawned += 1
    return { id: node.id, x: (parent?.x ?? 0) + Math.cos(angle) * distance, y: (parent?.y ?? 0) + Math.sin(angle) * distance }
  }

  const settle = () => {
    simulation.stop()
    simulation.tick(Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay())))
    pinAll()
    publish()
  }

  return {
    update(nodes, edges) {
      const next = new Map<number, Datum>()
      for (const node of nodes) next.set(node.id, data.get(node.id) ?? spawn(node, new Map([...data, ...next])))
      data = next
      const links = edges.filter((e) => data.has(e.source) && data.has(e.target)).map((e): Link => ({ source: e.source, target: e.target, similarity: e.similarity }))
      simulation.nodes([...data.values()])
      simulation.force('link', forceLink<Datum, Link>(links).id((d) => d.id).distance((l) => LINK_DISTANCE.base + LINK_DISTANCE.span * (1 - l.similarity)))
      simulation.alpha(0.8)
      if (animate) {
        simulation.restart()
        publish()
      } else {
        settle()
      }
    },
    settle,
    positions: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    stop: () => void simulation.stop(),
  }
}
