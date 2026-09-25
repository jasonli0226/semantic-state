import type { Vec } from 'semantic-state/core'

export type Source = 'github' | 'ci' | 'slack' | 'calendar' | 'email' | 'jira'

export type Phase = 'payments' | 'hiring'

export interface Item {
  readonly id: string
  readonly source: Source
  readonly sender: string
  readonly title: string
  readonly body: string
  readonly labels: readonly string[]
  readonly dueAt: number | null
  readonly createdAt: number
}

export type RankSource = 'semantic' | 'fallback' | 'rules'

export interface RankedItem {
  readonly id: string
  readonly score: number
  readonly confidence: number
  readonly source: RankSource
}

export type { Vec }

export type VectorLookup = (id: string) => Vec | undefined
