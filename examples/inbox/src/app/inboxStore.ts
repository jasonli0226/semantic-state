import type { Item, Phase } from '../core/types.ts'

/**
 * The exact, non-semantic state of the inbox: which items exist, which were opened or done, and the
 * demo's current focus. A plain external store — ranking lives in semantic-state, not here.
 */
export interface InboxState {
  readonly items: readonly Item[]
  readonly seen: readonly string[]
  readonly done: readonly string[]
  readonly phase: Phase
}

export const initialState = (items: readonly Item[]): InboxState => ({ items, seen: [], done: [], phase: 'payments' })

export const reset = (_: InboxState, items: readonly Item[]): InboxState => initialState(items)

export const opened = (s: InboxState, id: string): InboxState => (s.seen.includes(id) ? s : { ...s, seen: [...s.seen, id] })

export const completed = (s: InboxState, id: string): InboxState => ({ ...opened(s, id), done: [...s.done, id] })

export const arrived = (s: InboxState, item: Item): InboxState =>
  s.items.some((i) => i.id === item.id) ? s : { ...s, items: [item, ...s.items] }

export const itemsAdded = (s: InboxState, items: readonly Item[]): InboxState => ({ ...s, items: [...s.items, ...items] })

export const phaseChanged = (s: InboxState, phase: Phase): InboxState => ({ ...s, phase })

export function activeItems(s: InboxState): Item[] {
  const done = new Set(s.done)
  return s.items.filter((item) => !done.has(item.id))
}

export interface InboxStore {
  getState(): InboxState
  subscribe(listener: () => void): () => void
  update(fn: (state: InboxState) => InboxState): void
}

export function createInboxStore(items: readonly Item[]): InboxStore {
  let state = initialState(items)
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    update(fn) {
      const next = fn(state)
      if (next === state) return
      state = next
      listeners.forEach((listener) => listener())
    },
  }
}
