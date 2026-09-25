import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Belief, RankedItem } from '../core/types.ts'
import { COMMIT_DEFAULTS } from './config.ts'
import { useSemanticEngine } from './context.ts'
import { type CommitPolicyOptions, useCommitPolicy } from './useCommitPolicy.ts'

const NO_RESULTS: readonly RankedItem[] = []
const NO_DUPLICATES: readonly (readonly string[])[] = []

/**
 * Subscribe to a relevance query instead of a key.
 * Reads are a snapshot of the worker's latest ranking (no model call in the render path);
 * the visible order changes only when the commit policy allows it.
 */
export function useSemantic(query: string, options: Partial<CommitPolicyOptions> = {}) {
  const engine = useSemanticEngine()
  useEffect(() => engine.watch(query), [engine, query])
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  const result = snapshot.results[query]
  const ranked = result?.ranked ?? NO_RESULTS
  const duplicates = result?.duplicates ?? NO_DUPLICATES

  const policy = useCommitPolicy(ranked, { ...COMMIT_DEFAULTS, ...options })

  const beliefs = useMemo(
    () =>
      policy.visible.map(
        (r): Belief<string> => ({ value: r.id, confidence: r.confidence, source: r.source, updatedAt: result?.updatedAt ?? 0 }),
      ),
    [policy.visible, result?.updatedAt],
  )
  /** Representative id → number of near-duplicates folded into it. */
  const duplicatesOf = useMemo(() => new Map(duplicates.map((group) => [group[0], group.length - 1])), [duplicates])

  return {
    status: snapshot.status,
    progress: snapshot.progress,
    error: snapshot.error,
    beliefs,
    duplicatesOf,
    pending: policy.pending,
    commit: policy.commit,
    pin: policy.pin,
    panelProps: policy.panelProps,
    reordersDuringInteraction: policy.reordersDuringInteraction,
    rankMs: result?.rankMs ?? null,
    itemCount: result?.itemCount ?? 0,
    networkRequests: result?.networkRequests ?? 0,
    embedMs: snapshot.lastEmbedMs,
  }
}
