import type { Belief, Id } from 'semantic-state'
import type { Article } from '../types.ts'

/**
 * The only place ranking signals become visuals. The SVG, the legend and the detail panel all read
 * `encode`'s output, so what a node looks like and the explanation of why can't disagree.
 */

export type Tone = 'search' | 'muted' | `lane-${number}`

export interface Visual {
  readonly radius: number
  readonly tone: Tone
  /** 0..1 — opacity of the ring drawn around articles you clicked. */
  readonly ring: number
  readonly why: string
}

export const MIN_RADIUS = 8
export const MAX_RADIUS = 28

export interface NodeSignals {
  readonly belief?: Belief<Article>
  /** Present when the user clicked this article: its current interest weight. */
  readonly interestWeight?: number
}

export interface EncodeContext {
  readonly query: string
  readonly lanes: ReadonlyMap<Id, number>
  readonly titleOf: (id: Id) => string
}

const fmt = (x: number) => x.toFixed(2)
const laneTone = (lanes: ReadonlyMap<Id, number>, id: Id): Tone => {
  const lane = lanes.get(id)
  return lane === undefined ? 'muted' : `lane-${lane}`
}

export function encode(id: number, { belief, interestWeight }: NodeSignals, ctx: EncodeContext): Visual {
  if (interestWeight !== undefined) {
    return { radius: MAX_RADIUS, tone: laneTone(ctx.lanes, id), ring: interestWeight, why: `You clicked this · interest weight ${fmt(interestWeight)}, fading with each new click` }
  }
  if (!belief) {
    return { radius: MIN_RADIUS, tone: 'muted', ring: 0, why: 'Not in the current ranking · shown because it neighbours an article you expanded' }
  }
  const radius = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * belief.confidence
  const confidence = `Confidence ${fmt(belief.confidence)}`
  const { kind, becauseOf } = belief.reason
  switch (kind) {
    case 'interest':
      return becauseOf === null
        ? { radius, tone: 'muted', ring: 0, why: `${confidence} · like your recent clicks` }
        : { radius, tone: laneTone(ctx.lanes, becauseOf), ring: 0, why: `${confidence} · because you clicked ${ctx.titleOf(becauseOf)}` }
    case 'search':
      return { radius, tone: 'search', ring: 0, why: `${confidence} · matches “${ctx.query}”` }
    case 'fallback':
      return { radius, tone: 'muted', ring: 0, why: `${confidence} · no strong signal` }
  }
}

/** Stable colour per interest: kept while the interest lives, new ones take the lowest free lane. */
export function assignLanes(previous: ReadonlyMap<Id, number>, interestIds: readonly Id[], laneCount: number): ReadonlyMap<Id, number> {
  const kept = [...previous].filter(([id]) => interestIds.includes(id))
  const used = new Set(kept.map(([, lane]) => lane))
  const free = Array.from({ length: laneCount }, (_, lane) => lane).filter((lane) => !used.has(lane))
  const added = interestIds.filter((id) => !previous.has(id)).map((id, i) => [id, free[i] ?? i % laneCount] as const)
  if (kept.length === previous.size && added.length === 0) return previous
  return new Map([...kept, ...added])
}

export const sameVisual = (a: Visual, b: Visual) => a.radius === b.radius && a.tone === b.tone && a.ring === b.ring
