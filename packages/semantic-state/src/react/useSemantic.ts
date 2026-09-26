import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Belief, CommitPolicy, Id } from '../core/types.ts'
import { normalizeQuery, similarKey } from '../store/store.ts'
import type { QueryResult, ResultRow } from '../worker/protocol.ts'
import { COMMIT_DEFAULTS } from './config.ts'
import { useSemanticStore } from './storeContext.ts'
import { useCommitPolicy } from './useCommitPolicy.ts'

export interface UseSemanticOptions {
  /** When the visible order may change: after the pointer rests (default), on Refresh, or immediately. */
  readonly commit?: CommitPolicy
  readonly hysteresis?: number
  readonly idleMs?: number
}

interface Shown<T> {
  readonly query: string
  readonly result: QueryResult<T>
}

/**
 * Subscribe to a relevance query instead of a key. Returns ranked items as beliefs (value, confidence,
 * reason). Reads are snapshots of the worker's latest ranking — no model call in the render path.
 */
export function useSemantic<T>(query: string, options: UseSemanticOptions = {}) {
  const store = useSemanticStore<T>()
  const normalized = normalizeQuery(query)
  useEffect(() => store.watch(normalized), [store, normalized])
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)

  // While a new query is being ranked, keep showing the last results instead of flashing empty.
  const current = snapshot.results[normalized]
  const [held, setHeld] = useState<Shown<T> | null>(null)
  if (current && held?.result !== current) setHeld({ query: normalized, result: current })
  const shown: Shown<T> | null = current ? { query: normalized, result: current } : held

  const rows = useMemo(() => shown?.result.ranked ?? [], [shown?.result])
  const byKey = useMemo(() => new Map(rows.map((r) => [String(r.id), r])), [rows])
  const rankable = useMemo(() => rows.map((r) => ({ id: String(r.id), score: r.score })), [rows])
  const committed = useCommitPolicy(rankable, {
    policy: options.commit ?? COMMIT_DEFAULTS.policy,
    hysteresis: options.hysteresis ?? COMMIT_DEFAULTS.hysteresis,
    idleMs: options.idleMs ?? COMMIT_DEFAULTS.idleMs,
  })

  const extras = useMemo(() => new Map(shown?.result.extras.map(([id, n]) => [String(id), n])), [shown?.result])
  const beliefs = useMemo(
    () =>
      committed.visible.flatMap((v): Belief<T>[] => {
        const row = byKey.get(v.id)
        if (!row) return []
        return [{ value: row.item, confidence: row.confidence, reason: row.reason, groupExtras: extras.get(v.id) ?? 0, updatedAt: shown?.result.updatedAt ?? 0 }]
      }),
    [committed.visible, byKey, extras, shown?.result.updatedAt],
  )
  const { pin: pinKey } = committed
  const pin = useMemo(() => (id: Id | null) => pinKey(id === null ? null : String(id)), [pinKey])

  return {
    status: snapshot.status,
    error: snapshot.error,
    model: snapshot.model,
    /** The query as sent to the worker (trimmed, capped). */
    query: normalized,
    /** The query the shown results belong to — differs from `query` while a new one is being ranked. */
    resultQuery: shown?.query ?? null,
    beliefs,
    interests: shown?.result.interests ?? [],
    pending: committed.pending,
    commit: committed.commit,
    /** Keep an item in its slot (e.g. while hovered). */
    pin,
    /** Spread on the list container: activity inside it holds the order under the onIdle policy. */
    panelProps: committed.panelProps,
    reordersDuringInteraction: committed.reordersDuringInteraction,
    rankMs: shown?.result.rankMs ?? null,
    itemCount: shown?.result.itemCount ?? 0,
    networkRequests: shown?.result.networkRequests ?? null,
  }
}

/** Nearest neighbours of one item (outside its group), re-requested when weights change. */
export function useSimilar<T>(id: Id | null, k = 6): readonly ResultRow<T>[] | null {
  const store = useSemanticStore<T>()
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  const { status, weights } = snapshot
  useEffect(() => {
    if (id !== null && status === 'ready') store.requestSimilar(id, k)
  }, [store, id, k, status, weights])
  return id === null ? null : (snapshot.similar[similarKey(id, k)] ?? null)
}

/** The raw store snapshot: status, model state, weights. */
export function useSemanticSnapshot<T>() {
  const store = useSemanticStore<T>()
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
}
