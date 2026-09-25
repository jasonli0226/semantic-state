import { useMemo, useSyncExternalStore } from 'react'
import type { Belief, RankedItem } from '../core/types.ts'
import { COMMIT_DEFAULTS, type CommitPolicy } from '../semantic/config.ts'
import { useCommitPolicy } from '../semantic/useCommitPolicy.ts'
import { usePokedexEngine } from './context.ts'
import type { RankReason } from './rank.ts'
import type { Pokemon } from './types.ts'

export interface PokemonBelief extends Belief<Pokemon> {
  readonly reason: RankReason
  /** Evolution-family members folded into this result. */
  readonly familyExtras: number
}

const NONE: readonly RankedItem[] = []

/**
 * The Redux-free version: one hook returns ranked Pokémon (not ids), with confidence and a reason,
 * shown through the same commit policy as the inbox demo.
 */
export function usePokedex(policy: CommitPolicy = COMMIT_DEFAULTS.policy) {
  const engine = usePokedexEngine()
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  const result = snapshot.result

  const asRankedItems = useMemo(
    () => result?.ranked.map((r): RankedItem => ({ id: String(r.id), score: r.score, confidence: r.confidence, source: 'semantic' })) ?? NONE,
    [result],
  )
  const committed = useCommitPolicy(asRankedItems, { ...COMMIT_DEFAULTS, policy })

  const beliefs = useMemo(() => {
    const reasons = new Map(result?.ranked.map((r) => [r.id, r.reason]))
    const extras = new Map(result?.familyExtras)
    return committed.visible.flatMap((row): PokemonBelief[] => {
      const id = Number(row.id)
      const pokemon = snapshot.byId.get(id)
      const reason = reasons.get(id)
      if (!pokemon || !reason) return []
      return [{ value: pokemon, confidence: row.confidence, source: 'semantic', updatedAt: 0, reason, familyExtras: extras.get(id) ?? 0 }]
    })
  }, [committed.visible, result, snapshot.byId])

  const interests = useMemo(
    () => (result?.interests ?? []).flatMap((i) => (snapshot.byId.has(i.id) ? [{ pokemon: snapshot.byId.get(i.id)!, weight: i.weight }] : [])),
    [result, snapshot.byId],
  )

  return {
    status: snapshot.status,
    error: snapshot.error,
    model: snapshot.model,
    pokedex: snapshot.pokedex,
    byId: snapshot.byId,
    weights: snapshot.weights,
    similar: snapshot.similar,
    query: result?.query ?? '',
    interests,
    beliefs,
    pending: committed.pending,
    commit: committed.commit,
    pin: committed.pin,
    panelProps: committed.panelProps,
    reordersDuringInteraction: committed.reordersDuringInteraction,
    rankMs: result?.rankMs ?? null,
    networkRequests: result?.networkRequests ?? null,
    search: engine.search,
    click: engine.click,
    forget: engine.forget,
    clear: engine.clear,
    setWeights: engine.setWeights,
    requestSimilar: engine.similar,
  }
}
