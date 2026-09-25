import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { selectBaselineRanking } from '../app/store.ts'
import { COMMIT_DEFAULTS, VISIBLE_ROWS } from '../semantic/config.ts'
import { useActivity, useReorderCount } from '../semantic/useActivity.ts'
import { Panel } from './Panel.tsx'
import { formatMs, formatPrecision, usePrecisionAt5, useRowRenderer } from './useRowRenderer.tsx'

export function BaselinePanel() {
  const { ranked, rankMs } = useSelector(selectBaselineRanking)
  const ids = useMemo(() => ranked.slice(0, VISIBLE_ROWS).map((r) => r.id), [ranked])
  const beliefs = useMemo(() => new Map(ranked.map((r) => [r.id, r])), [ranked])
  const { panelProps, isActive } = useActivity(COMMIT_DEFAULTS.idleMs)
  const reorders = useReorderCount(ids, isActive)
  const precision = usePrecisionAt5(ids)
  const renderRow = useRowRenderer({ beliefs })

  return (
    <Panel
      accent="baseline"
      kicker="Same algorithm, Redux way"
      title="createSelector baseline"
      description="Identical embeddings + centroid ranking, recomputed synchronously in a memoized selector on every change. No commit policy."
      stats={[
        { label: 'precision@5', value: formatPrecision(precision) },
        { label: 'rank (main thread)', value: formatMs(rankMs), hint: 'Blocks the UI while it runs' },
        {
          label: 'reorders while in use',
          value: String(reorders),
          tone: reorders > 0 ? 'bad' : undefined,
          hint: 'Order changed while your pointer was working in this panel',
        },
      ]}
      ids={ids}
      renderRow={renderRow}
      panelProps={panelProps}
    />
  )
}
