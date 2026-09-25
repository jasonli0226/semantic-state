import type { SemanticStore } from 'semantic-state'
import { makeSynthetic } from '../core/synthetic.ts'
import type { Item } from '../core/types.ts'
import { DEMO_NOW } from '../data/dataset.ts'
import type { ScenarioAction, ScenarioStep } from './scenario.ts'
import { type InboxStore, arrived, completed, itemsAdded, opened, phaseChanged, reset } from './inboxStore.ts'

/**
 * The join point: each user action updates the exact inbox state and feeds the semantic layer.
 * Components never talk to either directly.
 */
export interface InboxActions {
  open(id: string): void
  complete(id: string): void
  arrive(item: Item): void
  reset(): void
  scale(count: number): void
  runStep(step: ScenarioStep): Promise<void>
}

const SYNTHETIC_SEED = 42
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function createInboxActions(
  store: InboxStore,
  semantic: SemanticStore<Item>,
  initialItems: readonly Item[],
  { stepDelayMs }: { stepDelayMs: number },
): InboxActions {
  // Real items' vectors, kept only to build synthetic look-alikes for the scale test.
  const vectors = new Map<string, Float32Array>()
  semantic.onEmbedded((pairs) => pairs.forEach(([id, vector]) => vectors.set(String(id), vector)))

  const self: InboxActions = {
    open(id) {
      store.update((s) => opened(s, id))
      semantic.interact(id, 'open')
    },
    complete(id) {
      store.update((s) => completed(s, id))
      semantic.interact(id, 'done')
      semantic.remove([id])
    },
    arrive(item) {
      store.update((s) => arrived(s, item))
      semantic.upsert([item])
    },
    reset() {
      store.update((s) => reset(s, initialItems))
      semantic.reset(initialItems)
    },
    scale(count) {
      // Synthetic items come with vectors (perturbed copies of real ones), so the worker embeds nothing.
      const { items } = store.getState()
      const bases = items.flatMap((item) => {
        const vector = vectors.get(item.id)
        return !item.id.startsWith('syn-') && vector ? [{ item, vector }] : []
      })
      const startIndex = items.filter((i) => i.id.startsWith('syn-')).length
      const synthetic = makeSynthetic(bases, count, { startIndex, now: DEMO_NOW, seed: SYNTHETIC_SEED + startIndex })
      if (synthetic.length === 0) return
      const pairs = synthetic.map((s) => [s.item.id, s.vector] as const)
      store.update((s) => itemsAdded(s, synthetic.map((x) => x.item)))
      semantic.upsert(
        synthetic.map((s) => s.item),
        { vectors: pairs },
      )
    },
    async runStep(step) {
      for (const action of step.actions) {
        apply(action)
        // Pause between clicks so viewers can watch each panel react.
        if (action.kind === 'open') await sleep(stepDelayMs)
      }
    },
  }

  function apply(action: ScenarioAction) {
    switch (action.kind) {
      case 'reset':
        return self.reset()
      case 'open':
        return self.open(action.id)
      case 'arrive':
        return self.arrive(action.item)
      case 'phase':
        return store.update((s) => phaseChanged(s, action.phase))
    }
  }

  return self
}
