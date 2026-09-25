import { type Centroid, DEFAULT_DECAY, EMPTY_CENTROID, observe } from './centroid.ts'
import { DEFAULT_MULTI_INTEREST, type Interest, addInterest, removeInterest } from './interests.ts'
import type { Id, Vec } from './types.ts'

/** How interactions shape ranking. */
export type InterestConfig =
  | {
      /** One decayed average of everything interacted with — good for a single focus that drifts. */
      readonly mode: 'centroid'
      readonly decay?: number
      /** Pull per interaction kind, e.g. { open: 1, done: 1.5 }. Defaults to 1. */
      readonly strength?: Readonly<Record<string, number>>
    }
  | {
      /** Each recent interaction kept separately — good for several interests at once. */
      readonly mode: 'multi'
      readonly decay?: number
      readonly max?: number
      readonly minWeight?: number
      /** Leave interacted items out of the results (they are already known). */
      readonly excludeInteracted?: boolean
    }

export interface AttentionState {
  readonly centroid: Centroid
  readonly interests: readonly Interest[]
  readonly interacted: ReadonlySet<Id>
}

export const EMPTY_ATTENTION: AttentionState = { centroid: EMPTY_CENTROID, interests: [], interacted: new Set() }

export function recordInteraction(state: AttentionState, id: Id, kind: string, textVec: Vec | undefined, config: InterestConfig): AttentionState {
  const interacted = new Set([...state.interacted, id])
  if (config.mode === 'centroid') {
    const strength = config.strength?.[kind] ?? 1
    const centroid = textVec ? observe(state.centroid, textVec, strength, config.decay ?? DEFAULT_DECAY) : state.centroid
    return { ...state, centroid, interacted }
  }
  const opts = { ...DEFAULT_MULTI_INTEREST, ...stripUndefined({ decay: config.decay, max: config.max, minWeight: config.minWeight }) }
  return { ...state, interests: addInterest(state.interests, id, opts), interacted }
}

export function forgetInteraction(state: AttentionState, id: Id): AttentionState {
  return {
    ...state,
    interests: removeInterest(state.interests, id),
    interacted: new Set([...state.interacted].filter((x) => x !== id)),
  }
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}
