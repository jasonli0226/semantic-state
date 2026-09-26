import type { Point } from './mapLayout.ts'

/** Pure camera maths for the map: world (layout) coordinates → screen pixels via `{ x, y, k }`. */

export interface Transform {
  readonly x: number
  readonly y: number
  readonly k: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

export interface Bounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export const SCALE_EXTENT = [0.3, 8] as const
/** Zoom level the camera moves to for a search result. */
export const SEARCH_SCALE = 2
const LABEL_RANKED_SCALE = 1.5
const LABEL_ALL_SCALE = 3
const LABEL_RANKED_RADIUS = 12

const clampScale = (k: number) => Math.min(SCALE_EXTENT[1], Math.max(SCALE_EXTENT[0], k))

export function boundsOf(points: Iterable<Point>): Bounds {
  const list = [...points]
  const xs = list.length > 0 ? list.map((p) => p.x) : [0]
  const ys = list.length > 0 ? list.map((p) => p.y) : [0]
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

export function fitTransform(bounds: Bounds, viewport: Size, padding = 40): Transform {
  const width = Math.max(bounds.maxX - bounds.minX, 1)
  const height = Math.max(bounds.maxY - bounds.minY, 1)
  const k = clampScale(Math.min((viewport.width - 2 * padding) / width, (viewport.height - 2 * padding) / height))
  return centerOn({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }, viewport, k)
}

export const centerOn = (point: Point, viewport: Size, k: number): Transform => ({
  x: viewport.width / 2 - point.x * k,
  y: viewport.height / 2 - point.y * k,
  k,
})

export const toScreen = (point: Point, t: Transform): Point => ({ x: point.x * t.k + t.x, y: point.y * t.k + t.y })

export function onScreen(point: Point, t: Transform, viewport: Size, margin = 0): boolean {
  const s = toScreen(point, t)
  return s.x >= -margin && s.y >= -margin && s.x <= viewport.width + margin && s.y <= viewport.height + margin
}

/** Level of detail: which nodes get a text label at this zoom. */
export function labelVisible(node: { readonly always: boolean; readonly radius: number; readonly point: Point }, t: Transform, viewport: Size): boolean {
  if (node.always) return true
  if (t.k < LABEL_RANKED_SCALE || !onScreen(node.point, t, viewport)) return false
  return t.k >= LABEL_ALL_SCALE || node.radius >= LABEL_RANKED_RADIUS
}

export const transformAttr = (t: Transform) => `translate(${t.x} ${t.y}) scale(${t.k})`
