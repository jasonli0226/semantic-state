import { type HTMLAttributes, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { boundsOf, centerOn, fitTransform, labelVisible, onScreen, SEARCH_SCALE, transformAttr } from '../graph/camera.ts'
import type { Visual } from '../graph/encoding.ts'
import type { Point } from '../graph/mapLayout.ts'
import type { Edge } from '../graph/useNeighbors.ts'
import { useViewportSize, useZoom } from '../graph/useZoom.ts'

export type TrailEdge = Edge & { readonly opacity: number }

interface Props {
  readonly ids: readonly number[]
  readonly positions: ReadonlyMap<number, Point>
  readonly edges: readonly TrailEdge[]
  readonly visuals: ReadonlyMap<number, Visual>
  readonly titleOf: (id: number) => string
  readonly selected: number
  readonly onActivate: (id: number) => void
  readonly panelProps: HTMLAttributes<HTMLDivElement>
  readonly animate: boolean
  /** Move the camera to this article (search). `seq` changes on every request, so the same id can be sent again. */
  readonly cameraTarget: { readonly id: number; readonly seq: number } | null
}

const ZOOM_STEP = 1.6
const FOCUS_MARGIN = -40

function adjacency(edges: readonly Edge[]): ReadonlyMap<number, readonly number[]> {
  const sorted = [...edges].sort((a, b) => b.similarity - a.similarity)
  return sorted.reduce((map, e) => {
    map.set(e.source, [...(map.get(e.source) ?? []), e.target])
    map.set(e.target, [...(map.get(e.target) ?? []), e.source])
    return map
  }, new Map<number, number[]>())
}

/**
 * The whole map. Sizes are screen pixels (divided by the zoom scale), labels follow the level-of-detail rule.
 * Keyboard: one tab stop (the cursor), arrows walk the neighbours of where you started, Escape returns,
 * Enter/Space clicks, + - 0 zoom.
 */
export function GraphView({ ids, positions, edges, visuals, titleOf, selected, onActivate, panelProps, animate, cameraTarget }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const size = useViewportSize(container)
  const { transform: t, zooming, moveTo, zoomBy } = useZoom(svg, size, animate)
  const [hovered, setHovered] = useState<number | null>(null)
  const [cursor, setCursor] = useState(selected)
  const elements = useRef(new Map<number, SVGGElement>())
  const walk = useRef<{ origin: number; index: number } | null>(null)
  const neighboursOf = useMemo(() => adjacency(edges), [edges])
  const bounds = useMemo(() => boundsOf(positions.values()), [positions])
  const fit = () => moveTo(fitTransform(bounds, size))

  // Cursor follows the selection (click, search, reset).
  const [shownSelected, setShownSelected] = useState(selected)
  if (shownSelected !== selected) {
    setShownSelected(selected)
    setCursor(selected)
  }

  // Fit the whole map on first render and whenever the viewport size changes.
  useEffect(() => moveTo(fitTransform(bounds, size)), [bounds, size, moveTo])

  // Only a new request moves the camera, not a resize: the latest size and positions are read through a ref.
  const latest = useRef({ positions, size, moveTo })
  useEffect(() => {
    latest.current = { positions, size, moveTo }
  })
  useEffect(() => {
    if (!cameraTarget) return
    const { positions: at, size: viewport, moveTo: move } = latest.current
    const p = at.get(cameraTarget.id)
    if (p) move(centerOn(p, viewport, SEARCH_SCALE))
  }, [cameraTarget])

  const focusNode = (id: number) => {
    elements.current.get(id)?.focus()
    const p = positions.get(id)
    if (p && !onScreen(p, t, size, FOCUS_MARGIN)) moveTo(centerOn(p, size, t.k))
  }

  const onNodeKey = (id: number) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      walk.current = null
      return onActivate(id)
    }
    if (event.key === 'Escape' && walk.current) {
      focusNode(walk.current.origin)
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
    focusNode(list[index])
  }

  const onMapKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP)
    else if (event.key === '-') zoomBy(1 / ZOOM_STEP)
    else if (event.key === '0') fit()
  }

  const px = (v: number) => v / t.k

  return (
    <div className="graph" role="region" aria-label="Memory graph" ref={container} {...panelProps} onKeyDown={onMapKey}>
      <div className="zoom-controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
          −
        </button>
        <button type="button" aria-label="Fit map" onClick={fit}>
          Fit
        </button>
      </div>
      <svg ref={svg} aria-label={`Map of ${ids.length} articles`}>
        <g className={zooming ? 'world zooming' : 'world'} transform={transformAttr(t)}>
          <g>
            {edges.map((e) => {
              const a = positions.get(e.source)
              const b = positions.get(e.target)
              if (!a || !b) return null
              const hot = hovered !== null && (e.source === hovered || e.target === hovered)
              return (
                <line
                  key={`${e.source}-${e.target}`}
                  className={hot ? 'edge hot' : 'edge'}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  strokeWidth={px(1 + 3 * e.similarity)}
                  opacity={e.opacity}
                />
              )
            })}
          </g>
          {ids.map((id) => {
            const p = positions.get(id)
            const v = visuals.get(id)
            if (!p || !v) return null
            const title = titleOf(id)
            const always = v.ring > 0 || id === selected || id === hovered
            return (
              <g
                key={id}
                ref={(el) => void (el ? elements.current.set(id, el) : elements.current.delete(id))}
                className={`node tone-${v.tone}${id === selected ? ' selected' : ''}`}
                transform={`translate(${p.x} ${p.y})`}
                tabIndex={id === cursor ? 0 : -1}
                role="button"
                data-title={title}
                aria-label={`${title}. ${v.why}`}
                onClick={() => onActivate(id)}
                onKeyDown={onNodeKey(id)}
                onPointerEnter={() => setHovered(id)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => {
                  setHovered(id)
                  setCursor(id)
                }}
                onBlur={() => setHovered(null)}
              >
                {v.ring > 0 && <circle className="ring" r={px(v.radius + 5)} opacity={v.ring} />}
                <circle className="dot" r={px(v.radius)} />
                {labelVisible({ always, radius: v.radius, point: p }, t, size) && (
                  <text y={px(v.radius + 13)} fontSize={px(11)}>
                    {title}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
