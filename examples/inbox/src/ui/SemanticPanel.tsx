import type { ModelState } from 'semantic-state'
import { useSemantic } from 'semantic-state/react'
import { useMemo } from 'react'
import type { Item } from '../core/types.ts'
import { ATTENTION_QUERY, VISIBLE_ROWS } from '../semantic/config.ts'
import { Panel } from './Panel.tsx'
import { PendingBanner } from './PendingBanner.tsx'
import { useSettings } from './settings.ts'
import { formatMs, formatPrecision, usePrecisionAt5, useRowRenderer } from './useRowRenderer.tsx'

function ModelBanner({ model }: { model: ModelState }) {
  if (model.status === 'error') return <div className="banner banner-error">Semantic layer unavailable: {model.error}</div>
  if (model.status === 'ready') return null
  return (
    <div className="banner" role="status">
      <span>Loading embedding model on this device (once, then cached) — {Math.round(model.progress * 100)}%</span>
      <progress max={1} value={model.progress} />
    </div>
  )
}

export function SemanticPanel() {
  const { policy } = useSettings()
  const semantic = useSemantic<Item>(ATTENTION_QUERY, { commit: policy })
  const ids = useMemo(() => semantic.beliefs.slice(0, VISIBLE_ROWS).map((b) => b.value.id), [semantic.beliefs])
  const beliefs = useMemo(
    () => new Map(semantic.beliefs.map((b) => [b.value.id, { confidence: b.confidence, source: b.reason.kind === 'interest' ? 'semantic' : b.reason.kind }])),
    [semantic.beliefs],
  )
  const duplicatesOf = useMemo(() => new Map(semantic.beliefs.map((b) => [b.value.id, b.groupExtras])), [semantic.beliefs])
  const precision = usePrecisionAt5(ids)
  const { pin } = semantic
  const renderRow = useRowRenderer({ beliefs, duplicatesOf, onHover: pin })

  return (
    <Panel
      accent="semantic"
      kicker="Semantic layer · semantic-state"
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
          value: semantic.networkRequests === null ? '—' : String(semantic.networkRequests),
          tone: semantic.networkRequests === 0 ? 'good' : semantic.networkRequests === null ? undefined : 'bad',
          hint: 'Requests made by the worker after the model loaded',
        },
      ]}
      banner={
        <>
          <ModelBanner model={semantic.model} />
          <PendingBanner pending={semantic.pending} manual={policy === 'manual'} onCommit={semantic.commit} />
        </>
      }
      ids={ids}
      renderRow={renderRow}
      panelProps={semantic.panelProps}
    />
  )
}
