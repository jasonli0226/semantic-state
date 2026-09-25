import { HOUR } from '../core/time.ts'
import type { Item } from '../core/types.ts'
import { DEMO_NOW } from '../data/dataset.ts'

/** Below this, a semantic suggestion is shown dimmed as "suggested" rather than asserted. */
const LOW_CONFIDENCE = 0.35

export interface RowBelief {
  readonly confidence: number
  readonly source: string
}

interface ItemRowProps {
  readonly item: Item
  readonly belief?: RowBelief
  readonly seen: boolean
  readonly relevant: boolean
  readonly duplicates: number
  readonly onOpen: (id: string) => void
  readonly onDone: (id: string) => void
  readonly onHover?: (id: string | null) => void
}

function dueLabel(dueAt: number | null): string | null {
  if (dueAt === null) return null
  const hours = Math.round((dueAt - DEMO_NOW) / HOUR)
  if (hours < 0) return 'overdue'
  return hours < 48 ? `due in ${hours}h` : `due in ${Math.round(hours / 24)}d`
}

export function ItemRow({ item, belief, seen, relevant, duplicates, onOpen, onDone, onHover }: ItemRowProps) {
  const due = dueLabel(item.dueAt)
  const suggested = belief !== undefined && belief.confidence < LOW_CONFIDENCE
  const className = ['row', seen && 'row-seen', suggested && 'row-suggested'].filter(Boolean).join(' ')

  return (
    <li
      className={className}
      data-id={item.id}
      onPointerEnter={() => onHover?.(item.id)}
      onPointerLeave={() => onHover?.(null)}
    >
      <button type="button" className="row-main" onClick={() => onOpen(item.id)} onFocus={() => onHover?.(item.id)}>
        <span className="row-top">
          <span className={`src src-${item.source}`}>{item.source}</span>
          {relevant && <span className="truth" title="Answer key: this item needs attention in the current phase" aria-label="relevant" />}
          <span className="row-title">{item.title}</span>
        </span>
        <span className="row-meta">
          <span>{item.sender}</span>
          {due && <span className="chip chip-due">{due}</span>}
          {item.labels.map((label) => (
            <span key={label} className="chip">
              {label}
            </span>
          ))}
          {duplicates > 0 && <span className="chip chip-dup">+{duplicates} similar</span>}
          {suggested && <span className="chip chip-suggested">suggested</span>}
        </span>
      </button>
      {belief && (
        <span className="conf" title={`confidence ${Math.round(belief.confidence * 100)}% · ${belief.source}`}>
          <span className="conf-fill" style={{ width: `${Math.round(belief.confidence * 100)}%` }} />
        </span>
      )}
      <button type="button" className="row-done" onClick={() => onDone(item.id)} aria-label={`Mark "${item.title}" done`}>
        ✓
      </button>
    </li>
  )
}
