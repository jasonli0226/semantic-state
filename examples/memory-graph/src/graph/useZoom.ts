import { select } from 'd3-selection'
import 'd3-transition'
import { type D3ZoomEvent, zoom, zoomIdentity } from 'd3-zoom'
import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SCALE_EXTENT, type Size, type Transform } from './camera.ts'

const FALLBACK_SIZE: Size = { width: 800, height: 600 }
const MOVE_MS = 400

/**
 * The element's size: measured before the first paint (so the map doesn't fit twice and jump on load), then kept
 * current with ResizeObserver. jsdom has neither layout nor ResizeObserver → a fixed fallback.
 */
export function useViewportSize(ref: RefObject<Element | null>): Size {
  const [size, setSize] = useState<Size>(FALLBACK_SIZE)
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect()
    // oxlint-disable-next-line react/set-state-in-effect
    if (rect && rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height })
  }, [ref])
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return size
}

/**
 * d3-zoom on an <svg>: wheel, drag and pinch update `transform`; `moveTo` and `zoomBy` drive it from code.
 * `zooming` is true during a gesture, so the view can switch off size transitions while the scale changes.
 */
export function useZoom(ref: RefObject<SVGSVGElement | null>, size: Size, animate: boolean, onGesture?: () => void) {
  // Kept in a ref so the d3 listeners are bound once.
  const gesture = useRef(onGesture)
  useEffect(() => {
    gesture.current = onGesture
  })
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 })
  const [zooming, setZooming] = useState(false)
  const behavior = useMemo(() => zoom<SVGSVGElement, unknown>().scaleExtent([SCALE_EXTENT[0], SCALE_EXTENT[1]]), [])

  // Explicit extent: d3's default reads SVG width/height attributes, which this responsive SVG doesn't set.
  // Declared before the view's own effects, so it's current when the view fits the map.
  useEffect(() => {
    behavior.extent([
      [0, 0],
      [size.width, size.height],
    ])
  }, [behavior, size])

  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    behavior
      .on('start', () => setZooming(true))
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        // A sourceEvent means wheel, drag or pinch — the user moved the camera, not code.
        if (event.sourceEvent) gesture.current?.()
        setTransform({ x: event.transform.x, y: event.transform.y, k: event.transform.k })
      })
      .on('end', () => setZooming(false))
    const selection = select(svg).call(behavior)
    return () => void selection.on('.zoom', null)
  }, [ref, behavior])

  const moveTo = useCallback(
    (t: Transform, { instant = false } = {}) => {
      const svg = ref.current
      if (!svg) return
      const target = zoomIdentity.translate(t.x, t.y).scale(t.k)
      if (animate && !instant) select(svg).transition().duration(MOVE_MS).call(behavior.transform, target)
      else select(svg).call(behavior.transform, target)
    },
    [ref, behavior, animate],
  )

  const zoomBy = useCallback(
    (factor: number) => {
      const svg = ref.current
      if (svg) select(svg).call(behavior.scaleBy, factor)
    },
    [ref, behavior],
  )

  return { transform, zooming, moveTo, zoomBy }
}
