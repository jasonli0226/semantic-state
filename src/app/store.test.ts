import { describe, expect, it } from 'vitest'
import type { Item } from '../core/types.ts'
import { createAppStore, inbox, selectActiveItems, selectBaselineRanking, selectRulesRanking } from './store.ts'

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  source: 'email',
  sender: 's',
  title: id,
  body: '',
  labels: [],
  dueAt: null,
  createdAt: 0,
  ...over,
})
const vec = (...xs: number[]) => new Float32Array(xs)
const { actions } = inbox

function seeded() {
  const store = createAppStore([item('pay'), item('hire'), item('spam', { title: 'URGENT offer' })])
  store.dispatch(
    actions.vectorsEmbedded({
      vectors: [
        { id: 'pay', vector: vec(1, 0) },
        { id: 'hire', vector: vec(0, 1) },
        { id: 'spam', vector: vec(-1, 0) },
      ],
      synthetic: [],
    }),
  )
  return store
}

describe('inbox store', () => {
  it('ranks by hand-written rules', () => {
    const store = seeded()
    expect(selectRulesRanking(store.getState()).ranked[0].id).toBe('spam')
  })

  it('updates the attention centroid and seen set when an item is opened', () => {
    const store = seeded()
    store.dispatch(actions.opened('pay'))
    store.dispatch(actions.opened('pay'))
    const state = store.getState().inbox
    expect(state.seen).toEqual(['pay'])
    expect(state.centroid.weight).toBeGreaterThan(1)
  })

  it('ranks the baseline by the same semantic signal, synchronously in a selector', () => {
    const store = seeded()
    store.dispatch(actions.opened('hire'))
    store.dispatch(actions.opened('hire'))
    store.dispatch(actions.opened('hire'))
    const { ranked, rankMs } = selectBaselineRanking(store.getState())
    expect(ranked[0].id).toBe('hire')
    expect(rankMs).toBeGreaterThanOrEqual(0)
  })

  it('removes completed items from every ranking', () => {
    const store = seeded()
    store.dispatch(actions.completed('spam'))
    expect(selectActiveItems(store.getState()).map((i) => i.id)).toEqual(['pay', 'hire'])
    expect(selectRulesRanking(store.getState()).ranked.map((r) => r.id)).not.toContain('spam')
    expect(selectBaselineRanking(store.getState()).ranked.map((r) => r.id)).not.toContain('spam')
  })

  it('adds arriving and synthetic items, newest first', () => {
    const store = seeded()
    store.dispatch(actions.arrived(item('new')))
    store.dispatch(actions.vectorsEmbedded({ vectors: [{ id: 'syn-0', vector: vec(1, 0) }], synthetic: [item('syn-0')] }))
    const ids = store.getState().inbox.items.map((i) => i.id)
    expect(ids[0]).toBe('new')
    expect(ids).toContain('syn-0')
  })

  it('ignores a second arrival of the same item', () => {
    const store = seeded()
    store.dispatch(actions.arrived(item('new')))
    store.dispatch(actions.arrived(item('new')))
    expect(store.getState().inbox.items.filter((i) => i.id === 'new')).toHaveLength(1)
  })

  it('resets to the given items but keeps real vectors', () => {
    const store = seeded()
    store.dispatch(actions.opened('pay'))
    store.dispatch(actions.phaseChanged('hiring'))
    store.dispatch(actions.reset([item('pay')]))
    const state = store.getState().inbox
    expect(state.items.map((i) => i.id)).toEqual(['pay'])
    expect(state.seen).toEqual([])
    expect(state.centroid.weight).toBe(0)
    expect(state.phase).toBe('payments')
    expect(state.vectors.pay).toBeDefined()
  })

  it('memoizes selectors across unrelated state changes', () => {
    const store = seeded()
    const before = selectBaselineRanking(store.getState())
    store.dispatch(actions.phaseChanged('hiring'))
    expect(selectBaselineRanking(store.getState())).toBe(before)
  })
})
