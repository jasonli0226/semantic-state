import { type HTMLAttributes, type KeyboardEvent, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Visual } from '../graph/encoding.ts'
import type { VisibleNode } from '../graph/explored.ts'
import { type Positions, createLayout } from '../graph/layout.ts'
import type { Edge } from '../graph/useNeighbors.ts'

const PADDING = 60
/** Smallest area the view shows, so a handful of nodes isn't zoomed in to fill the screen. */
const MIN_VIEW = { width: 900, height: 640 }
const LABEL_MIN_RADIUS = 16

interface Props {
  readonly nodes: readonly VisibleNode[]
  readonly edges: readonly Edge[]
  readonly visuals: ReadonlyMap<number, Visual>
  readonly titleOf: (id: number) => string
  readonly selected: number | null
  readonly onActivate: (id: number) => void
  readonly panelProps: HTMLAttributes<HTMLDivElement>
  readonly animate: boolean
}

function useLayout(nodes: readonly VisibleNode[], edges: readonly Edge[], animate: boolean): Positions {
  const [layout] = useState(() => createLayout({ animate }))
  useLayoutEffect(() => () => layout.stop(), [layout])
  useLayoutEffect(() => layout.update(nodes, edges), [layout, nodes, edges])
  return useSyncExternalStore(layout.subscribe, layout.positions)
}

function viewBox(positions: Positions): string {
  const points = [...positions.values()]
  const xs = points.length > 0 ? points.map((p) => p.x) : [0]
  const ys = points.length > 0 ? points.map((p) => p.y) : [0]
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const width = Math.max(maxX - minX + 2 * PADDING, MIN_VIEW.width)
  const height = Math.max(maxY - minY + 2 * PADDING, MIN_VIEW.height)
  return `${(minX + maxX - width) / 2} ${(minY + maxY - height) / 2} ${width} ${height}`
}

function adjacency(edges: readonly Edge[]): ReadonlyMap<number, readonly number[]> {
  const sorted = [...edges].sort((a, b) => b.similarity - a.similarity)
  return sorted.reduce((map, e) => {
    map.set(e.source, [...(map.get(e.source) ?? []), e.target])
    map.set(e.target, [...(map.get(e.target) ?? []), e.source])
    return map
  }, new Map<number, number[]>())
}

/** SVG graph. Keyboard: Tab between articles, Enter expands, arrows browse the neighbours of where you started, Escape returns. */
export function GraphView({ nodes, edges, visuals, titleOf, selected, onActivate, panelProps, animate }: Props) {
  const positions = useLayout(nodes, edges, animate)
  const [hovered, setHovered] = useState<number | null>(null)
  const elements = useRef(new Map<number, SVGGElement>())
  const walk = useRef<{ origin: number; index: number } | null>(null)
  const neighboursOf = useMemo(() => adjacency(edges), [edges])

  const onKeyDown = (id: number) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      walk.current = null
      return onActivate(id)
    }
    if (event.key === 'Escape' && walk.current) {
      elements.current.get(walk.current.origin)?.focus()
      walk.current = null
      return
    }
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const origin = walk.current && (neighboursOf.get(walk.current.origin) ?? []).includes(id) ? walk.current : { origin: id, index: step === 1 ? -1 : 0 }
    const list = neighboursOf.get(origin.origin) ?? []
    if (list.length === 0) return
    const index = (origin.index + step + list.length) % list.length
    walk.current = { origin: origin.origin, index }
    elements.current.get(list[index])?.focus()
  }

  return (
    <div className="graph" role="region" aria-label="Memory graph" {...panelProps}>
      <svg viewBox={viewBox(positions)} aria-label={`${nodes.length} articles`}>
        <g>
          {edges.map((e) => {
            const a = positions.get(e.source)
            const b = positions.get(e.target)
            if (!a || !b) return null
            const hot = hovered !== null && (e.source === hovered || e.target === hovered)
            return <line key={`${e.source}-${e.target}`} className={hot ? 'edge hot' : 'edge'} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={1 + 3 * e.similarity} />
          })}
        </g>
        {nodes.map(({ id }) => {
          const p = positions.get(id)
          const v = visuals.get(id)
          if (!p || !v) return null
          const title = titleOf(id)
          const labelled = v.radius >= LABEL_MIN_RADIUS || v.ring > 0 || id === hovered || id === selected
          return (
            <g
              key={id}
              ref={(el) => void (el ? elements.current.set(id, el) : elements.current.delete(id))}
              className={`node tone-${v.tone}${id === selected ? ' selected' : ''}`}
              transform={`translate(${p.x} ${p.y})`}
              tabIndex={0}
              role="button"
              data-title={title}
              aria-label={`${title}. ${v.why}`}
              onClick={() => onActivate(id)}
              onKeyDown={onKeyDown(id)}
              onPointerEnter={() => setHovered(id)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(id)}
              onBlur={() => setHovered(null)}
            >
              {v.ring > 0 && <circle className="ring" r={v.radius + 5} opacity={v.ring} />}
              <circle className="dot" r={v.radius} />
              {labelled && <text y={v.radius + 13}>{title}</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
