import { useMemo } from 'react'
import type { Moves } from '../core/commit.ts'
import { ATTENTION_QUERY, VISIBLE_ROWS } from '../semantic/config.ts'
import { useSemantic } from '../semantic/useSemantic.ts'
import { Panel } from './Panel.tsx'
import { useSettings } from './settings.ts'
import { formatMs, formatPrecision, usePrecisionAt5, useRowRenderer } from './useRowRenderer.tsx'

function PendingBanner({ pending, manual, onCommit }: { pending: Moves; manual: boolean; onCommit: () => void }) {
  if (pending.movedUp + pending.added === 0) return null
  const parts = [pending.movedUp > 0 && `${pending.movedUp} moved up`, pending.added > 0 && `${pending.added} new`].filter(Boolean)
  return (
    <div className="pending" role="status">
      <span>{parts.join(' · ')}</span>
      {manual ? (
        <button type="button" onClick={onCommit}>
          Refresh
        </button>
      ) : (
        <span className="pending-hint">applies when you pause</span>
      )}
    </div>
  )
}

function ModelBanner({ status, progress, error }: { status: string; progress: number; error: string | null }) {
  if (status === 'error') return <div className="banner banner-error">Semantic layer unavailable: {error}</div>
  if (status === 'ready') return null
  return (
    <div className="banner" role="status">
      <span>Loading embedding model on this device (once, then cached) — {Math.round(progress * 100)}%</span>
      <progress max={1} value={progress} />
    </div>
  )
}

export function SemanticPanel() {
  const { policy } = useSettings()
  const semantic = useSemantic(ATTENTION_QUERY, { policy })
  const ids = useMemo(() => semantic.beliefs.slice(0, VISIBLE_ROWS).map((b) => b.value), [semantic.beliefs])
  const beliefs = useMemo(() => new Map(semantic.beliefs.map((b) => [b.value, b])), [semantic.beliefs])
  const precision = usePrecisionAt5(ids)
  const renderRow = useRowRenderer({ beliefs, duplicatesOf: semantic.duplicatesOf, onHover: semantic.pin })

  return (
    <Panel
      accent="semantic"
      kicker="Semantic layer"
      title={`useSemantic("${ATTENTION_QUERY}")`}
      description={`Local embeddings + attention centroid learned from what you open. Ranked in a Web Worker; commit policy: ${policy}.`}
      stats={[
        { label: 'precision@5', value: formatPrecision(precision) },
        { label: 'rank (worker)', value: formatMs(semantic.rankMs), hint: `${semantic.itemCount} items; main thread only receives the top 100` },
        {
          label: 'reorders while in use',
          value: String(semantic.reordersDuringInteraction),
          tone: semantic.reordersDuringInteraction > 0 ? 'bad' : 'good',
        },
        {
          label: 'network since ready',
          value: String(semantic.networkRequests),
          tone: semantic.networkRequests === 0 ? 'good' : 'bad',
          hint: 'Requests made by the worker after the model loaded',
        },
      ]}
      banner={
        <>
          <ModelBanner status={semantic.status} progress={semantic.progress} error={semantic.error} />
          <PendingBanner pending={semantic.pending} manual={policy === 'manual'} onCommit={semantic.commit} />
        </>
      }
      ids={ids}
      renderRow={renderRow}
      panelProps={semantic.panelProps}
    />
  )
}
