import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { selectRulesRanking } from '../app/store.ts'
import { VISIBLE_ROWS } from '../semantic/config.ts'
import { Panel } from './Panel.tsx'
import { formatMs, formatPrecision, usePrecisionAt5, useRowRenderer } from './useRowRenderer.tsx'

export function RulesPanel() {
  const { ranked, rankMs } = useSelector(selectRulesRanking)
  const ids = useMemo(() => ranked.slice(0, VISIBLE_ROWS).map((r) => r.id), [ranked])
  const precision = usePrecisionAt5(ids)
  const renderRow = useRowRenderer()

  return (
    <Panel
      accent="rules"
      kicker="Traditional"
      title="Rules"
      description="priority:high +3 · urgent|asap|critical +3 · manager +2 · failed / review requested +2 · deadline +0–2"
      stats={[
        { label: 'precision@5', value: formatPrecision(precision), hint: 'Top 5 vs the answer key for the current phase' },
        { label: 'rank (main thread)', value: formatMs(rankMs) },
        { label: 'adapts to you', value: 'never' },
      ]}
      ids={ids}
      renderRow={renderRow}
    />
  )
}
