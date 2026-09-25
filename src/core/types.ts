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

/** AI-derived state is never binary: every value carries how sure we are and where it came from. */
export interface Belief<T> {
  readonly value: T
  readonly confidence: number
  readonly source: RankSource
  readonly updatedAt: number
}

export type Vec = Float32Array

export type VectorLookup = (id: string) => Vec | undefined
