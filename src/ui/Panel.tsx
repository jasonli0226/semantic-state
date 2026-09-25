import { type HTMLAttributes, type ReactNode, useRef } from 'react'
import { useFlip } from './useFlip.ts'

export interface Stat {
  readonly label: string
  readonly value: string
  readonly tone?: 'good' | 'bad'
  readonly hint?: string
}

interface PanelProps {
  readonly kicker: string
  readonly title: string
  readonly description: string
  readonly stats: readonly Stat[]
  readonly ids: readonly string[]
  readonly renderRow: (id: string) => ReactNode
  readonly banner?: ReactNode
  readonly accent: 'rules' | 'semantic' | 'baseline'
  readonly panelProps?: HTMLAttributes<HTMLElement>
}

export function Panel({ kicker, title, description, stats, ids, renderRow, banner, accent, panelProps }: PanelProps) {
  const listRef = useRef<HTMLOListElement>(null)
  useFlip(listRef, ids.join('|'))

  return (
    <section className={`panel panel-${accent}`} aria-label={title} {...panelProps}>
      <header className="panel-head">
        <p className="kicker">{kicker}</p>
        <h2>{title}</h2>
        <p className="panel-desc">{description}</p>
        <dl className="stats">
          {stats.map((stat) => (
            <div key={stat.label} className={`stat ${stat.tone ? `stat-${stat.tone}` : ''}`} title={stat.hint}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </header>
      {banner}
      <ol className="rows" ref={listRef}>
        {ids.map(renderRow)}
      </ol>
    </section>
  )
}
