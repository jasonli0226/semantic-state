import type { CommitPolicy } from '../core/types.ts'

export interface CommitOptions {
  readonly policy: CommitPolicy
  /** Score changes smaller than this don't reorder the visible list. */
  readonly hysteresis: number
  /** onIdle: how long the pointer must rest before the new order is applied. */
  readonly idleMs: number
}

export const COMMIT_DEFAULTS: CommitOptions = { policy: 'onIdle', hysteresis: 0.05, idleMs: 2000 }
