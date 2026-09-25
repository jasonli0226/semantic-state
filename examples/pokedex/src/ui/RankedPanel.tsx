import { type HTMLAttributes, useRef } from 'react'
import { PendingBanner } from './PendingBanner.tsx'
import { useFlip } from './useFlip.ts'
import type { Pokemon } from '../types.ts'
import type { Belief, Id } from 'semantic-state'
import { Sprite, TypeChips } from './bits.tsx'

const VISIBLE = 15

const formatMs = (ms: number | null) => (ms === null ? '—' : `${ms < 1 ? ms.toFixed(2) : ms.toFixed(1)} ms`)

function reasonText(belief: Belief<Pokemon>, query: string, byId: ReadonlyMap<number, Pokemon>): string {
  if (belief.reason.kind === 'search') return `matches “${query}”`
  const source = belief.reason.becauseOf === null ? undefined : byId.get(Number(belief.reason.becauseOf))
  return source ? `like ${source.name}` : 'like your clicks'
}

interface RankedPanelProps {
  readonly beliefs: readonly Belief<Pokemon>[]
  readonly query: string
  readonly byId: ReadonlyMap<number, Pokemon>
  readonly pending: { movedUp: number; added: number }
  readonly manual: boolean
  readonly onCommit: () => void
  readonly onPick: (id: number) => void
  readonly onHover: (id: Id | null) => void
  readonly panelProps: HTMLAttributes<HTMLElement>
  readonly stats: { rankMs: number | null; networkRequests: number | null; reorders: number }
}

export function RankedPanel({ beliefs, query, byId, pending, manual, onCommit, onPick, onHover, panelProps, stats }: RankedPanelProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const top = beliefs.slice(0, VISIBLE)
  useFlip(listRef, top.map((b) => b.value.id).join('|'))

  return (
    <section className="panel panel-semantic ranked" aria-label="Ranked for you" {...panelProps}>
      <header className="panel-head">
        <p className="kicker">useSemantic() · semantic-state · no Redux</p>
        <h2>Ranked for you</h2>
        <p className="panel-desc">Your search + what you clicked. One result per evolution family; each click gets a lane.</p>
        <dl className="stats">
          <div className="stat">
            <dt>rank (worker)</dt>
            <dd>{formatMs(stats.rankMs)}</dd>
          </div>
          <div className={`stat ${stats.reorders > 0 ? 'stat-bad' : 'stat-good'}`}>
            <dt>reorders while in use</dt>
            <dd>{stats.reorders}</dd>
          </div>
          <div className={`stat ${stats.networkRequests ? 'stat-bad' : 'stat-good'}`} title="Worker requests after the search model loaded">
            <dt>network since model</dt>
            <dd>{stats.networkRequests ?? '—'}</dd>
          </div>
        </dl>
      </header>
      <PendingBanner pending={pending} manual={manual} onCommit={onCommit} />
      {top.length === 0 ? (
        <p className="empty">Describe a Pokémon above, or click a few in the Pokédex — this list learns from both.</p>
      ) : (
        <ol className="rows" ref={listRef}>
          {top.map((belief) => {
            const p = belief.value
            return (
              <li
                key={p.id}
                data-id={p.id}
                className={`row ${belief.confidence < 0.35 ? 'row-suggested' : ''}`}
                onPointerEnter={() => onHover(p.id)}
                onPointerLeave={() => onHover(null)}
              >
                <button type="button" className="row-main ranked-row" onClick={() => onPick(p.id)}>
                  <Sprite pokemon={p} size={44} />
                  <span className="ranked-text">
                    <span className="row-top">
                      <span className="row-title">{p.name}</span>
                      <TypeChips types={p.types} />
                    </span>
                    <span className="row-meta">
                      <span className={`reason reason-${belief.reason.kind}`}>{reasonText(belief, query, byId)}</span>
                      {belief.groupExtras > 0 && <span className="chip chip-dup">+{belief.groupExtras} in family</span>}
                    </span>
                  </span>
                </button>
                <span className="conf" title={`confidence ${Math.round(belief.confidence * 100)}% (uncalibrated)`}>
                  <span className="conf-fill" style={{ width: `${Math.round(belief.confidence * 100)}%` }} />
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
