import type { Item } from '../core/types.ts'
import type { SemanticEngine } from '../semantic/engine.ts'
import type { ScenarioAction, ScenarioStep } from './scenario.ts'
import { type AppStore, inbox } from './store.ts'

/**
 * The join point of the hybrid: each user action updates the traditional store (Redux)
 * and feeds the semantic layer (worker). Components never talk to either directly.
 */
export interface InboxActions {
  open(id: string): void
  complete(id: string): void
  arrive(item: Item): void
  reset(): void
  scale(count: number): void
  runStep(step: ScenarioStep): Promise<void>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function createInboxActions(
  store: AppStore,
  engine: SemanticEngine,
  initialItems: readonly Item[],
  { stepDelayMs }: { stepDelayMs: number },
): InboxActions {
  const { actions } = inbox

  const self: InboxActions = {
    open(id) {
      store.dispatch(actions.opened(id))
      engine.interact(id, 'open')
    },
    complete(id) {
      store.dispatch(actions.completed(id))
      engine.interact(id, 'done')
    },
    arrive(item) {
      store.dispatch(actions.arrived(item))
      engine.upsert([item])
    },
    reset() {
      store.dispatch(actions.reset(initialItems))
      engine.reset(initialItems)
    },
    scale: (count) => engine.scale(count),
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
        return void store.dispatch(actions.phaseChanged(action.phase))
    }
  }

  return self
}
