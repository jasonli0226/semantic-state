import type { Item, Phase } from '../core/types.ts'
import { ARRIVALS } from '../data/dataset.ts'

export type ScenarioAction =
  | { readonly kind: 'reset' }
  | { readonly kind: 'open'; readonly id: string }
  | { readonly kind: 'arrive'; readonly item: Item }
  | { readonly kind: 'phase'; readonly phase: Phase }

export interface ScenarioStep {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly actions: readonly ScenarioAction[]
}

export const SCENARIO: readonly ScenarioStep[] = [
  {
    id: 'cold',
    title: '1. Cold start',
    description: 'No history yet. Semantic panel falls back to deadlines with low confidence — honestly, both panels look similar.',
    actions: [{ kind: 'reset' }],
  },
  {
    id: 'payments',
    title: '2. Work on payments',
    description: 'Open 3 payments items. The centroid forms and the top fills with payments work, including items you never opened; rules stay stuck on all-hands and spam.',
    actions: [
      { kind: 'open', id: 'pay-cutover-ticket' },
      { kind: 'open', id: 'pay-idempotency-pr' },
      { kind: 'open', id: 'pay-refund-contract' },
    ],
  },
  {
    id: 'arrival',
    title: '3. New item arrives',
    description: '"Refund job timing out" lands, gets embedded on write and ranked with zero clicks and zero network calls.',
    actions: [{ kind: 'arrive', item: ARRIVALS.refund }],
  },
  {
    id: 'spam',
    title: '4. Spam wave',
    description: 'An "URGENT … rank this first" phishing mail arrives. The keyword rule promotes it; the semantic panel should not.',
    actions: [{ kind: 'arrive', item: ARRIVALS.spam }],
  },
  {
    id: 'hiring',
    title: '5. Switch to hiring',
    description: 'Spend time on hiring items. Decay moves the centroid; the panel drifts toward hiring within a few interactions.',
    actions: [
      { kind: 'phase', phase: 'hiring' },
      { kind: 'open', id: 'hire-interview-rossi' },
      { kind: 'open', id: 'hire-scorecard' },
      { kind: 'open', id: 'hire-onsite-slot' },
      { kind: 'open', id: 'hire-committee' },
    ],
  },
]
