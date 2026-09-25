import { describe, expect, it, vi } from 'vitest'
import type { Item } from '../core/types.ts'
import { activeItems, arrived, completed, createInboxStore, itemsAdded, opened, phaseChanged, reset } from './inboxStore.ts'

const item = (id: string): Item => ({ id, source: 'email', sender: 's', title: id, body: '', labels: [], dueAt: null, createdAt: 0 })
const initial = { items: [item('a'), item('b')], seen: [], done: [], phase: 'payments' as const }

describe('inbox state updates', () => {
  it('records opened items once', () => {
    expect(opened(opened(initial, 'a'), 'a').seen).toEqual(['a'])
  })

  it('completing marks done and seen, and hides the item', () => {
    const next = completed(initial, 'a')
    expect(next.done).toEqual(['a'])
    expect(next.seen).toEqual(['a'])
    expect(activeItems(next).map((i) => i.id)).toEqual(['b'])
  })

  it('puts new arrivals first and ignores repeats', () => {
    const next = arrived(arrived(initial, item('n')), item('n'))
    expect(next.items.map((i) => i.id)).toEqual(['n', 'a', 'b'])
  })

  it('appends bulk items', () => {
    expect(itemsAdded(initial, [item('s')]).items.map((i) => i.id)).toEqual(['a', 'b', 's'])
  })

  it('resets everything', () => {
    const next = reset(phaseChanged(opened(initial, 'a'), 'hiring'), [item('z')])
    expect(next).toEqual({ items: [item('z')], seen: [], done: [], phase: 'payments' })
  })

  it('never mutates the previous state', () => {
    const before = structuredClone(initial)
    completed(arrived(initial, item('n')), 'a')
    expect(initial).toEqual(before)
  })
})

describe('createInboxStore', () => {
  it('notifies subscribers with a new state object', () => {
    const store = createInboxStore(initial.items)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const before = store.getState()
    store.update((s) => opened(s, 'a'))
    expect(store.getState()).not.toBe(before)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.update((s) => opened(s, 'b'))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('skips notifying when an update returns the same state', () => {
    const store = createInboxStore(initial.items)
    const listener = vi.fn()
    store.subscribe(listener)
    store.update((s) => s)
    expect(listener).not.toHaveBeenCalled()
  })
})
