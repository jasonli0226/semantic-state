import { useMemo } from 'react'
import { type InboxState, activeItems } from '../app/inboxStore.ts'
import { rankByRules } from '../core/rules.ts'
import { DEMO_NOW } from '../data/dataset.ts'
import { VISIBLE_ROWS } from '../semantic/config.ts'
import { useInboxState } from './actionsContext.ts'
import { Panel } from './Panel.tsx'
import { formatMs, formatPrecision, usePrecisionAt5, useRowRenderer } from './useRowRenderer.tsx'

/** Hand-written ranking, timed so the panel can show its cost next to the worker's. */
function timedRulesRanking(state: InboxState) {
  const started = performance.now()
  const ranked = rankByRules(activeItems(state), DEMO_NOW)
  return { ranked, rankMs: performance.now() - started }
}

export function RulesPanel() {
  const state = useInboxState()
  const { ranked, rankMs } = useMemo(() => timedRulesRanking(state), [state])
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
