import { useCallback, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { selectItemsById, selectPhase, selectSeen } from '../app/store.ts'
import { precisionAtK } from '../core/metrics.ts'
import { groundTruth } from '../data/dataset.ts'
import { useInboxActions } from './actionsContext.ts'
import { ItemRow, type RowBelief } from './ItemRow.tsx'
import { useSettings } from './settings.ts'

interface RowOptions {
  readonly beliefs?: ReadonlyMap<string, RowBelief>
  readonly duplicatesOf?: ReadonlyMap<string, number>
  readonly onHover?: (id: string | null) => void
}

/** Shared row rendering: item data comes from the traditional store, ranking from whichever panel. */
export function useRowRenderer({ beliefs, duplicatesOf, onHover }: RowOptions = {}) {
  const items = useSelector(selectItemsById)
  const seen = useSelector(selectSeen)
  const phase = useSelector(selectPhase)
  const actions = useInboxActions()
  const { showAnswerKey } = useSettings()

  return useCallback(
    (id: string) => {
      const item = items.get(id)
      if (!item) return null
      return (
        <ItemRow
          key={id}
          item={item}
          belief={beliefs?.get(id)}
          seen={seen.has(id)}
          relevant={showAnswerKey && groundTruth[phase].has(id)}
          duplicates={duplicatesOf?.get(id) ?? 0}
          onOpen={actions.open}
          onDone={actions.complete}
          onHover={onHover}
        />
      )
    },
    [items, beliefs, seen, showAnswerKey, phase, duplicatesOf, actions, onHover],
  )
}

/** Precision@5 of a panel's visible order against the current phase's answer key. */
export function usePrecisionAt5(ids: readonly string[]): number {
  const phase = useSelector(selectPhase)
  return useMemo(() => precisionAtK(ids, groundTruth[phase], 5), [ids, phase])
}

export const formatMs = (ms: number | null) => (ms === null ? '—' : `${ms < 1 ? ms.toFixed(2) : ms.toFixed(1)} ms`)
export const formatPrecision = (p: number) => `${Math.round(p * 5)}/5`
