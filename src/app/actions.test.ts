import type { SemanticStore } from 'semantic-state'
import { describe, expect, it, vi } from 'vitest'
import type { Item } from '../core/types.ts'
import { createInboxActions } from './actions.ts'
import type { ScenarioStep } from './scenario.ts'
import { createInboxStore } from './inboxStore.ts'

const item = (id: string): Item => ({ id, source: 'email', sender: 's', title: id, body: '', labels: [], dueAt: null, createdAt: 0 })

function fakeSemantic() {
  let embedded: ((vectors: readonly (readonly [string, Float32Array])[]) => void) | null = null
  return {
    reset: vi.fn(),
    upsert: vi.fn(),
    interact: vi.fn(),
    remove: vi.fn(),
    onEmbedded: (fn: typeof embedded) => {
      embedded = fn
      return () => {}
    },
    emitEmbedded: (vectors: readonly (readonly [string, Float32Array])[]) => embedded?.(vectors),
  }
}

function setup() {
  const store = createInboxStore([item('a')])
  const semantic = fakeSemantic()
  const actions = createInboxActions(store, semantic as unknown as SemanticStore<Item>, [item('a')], { stepDelayMs: 0 })
  return { store, semantic, actions }
}

describe('inbox actions', () => {
  it('sends every interaction to both the inbox state and the semantic store', () => {
    const { store, semantic, actions } = setup()
    actions.open('a')
    actions.complete('a')
    expect(semantic.interact).toHaveBeenNthCalledWith(1, 'a', 'open')
    expect(semantic.interact).toHaveBeenNthCalledWith(2, 'a', 'done')
    expect(semantic.remove).toHaveBeenCalledWith(['a'])
    expect(store.getState().done).toEqual(['a'])
  })

  it('embeds arriving items through the semantic store', () => {
    const { store, semantic, actions } = setup()
    actions.arrive(item('n'))
    expect(semantic.upsert).toHaveBeenCalledWith([item('n')])
    expect(store.getState().items[0].id).toBe('n')
  })

  it('runs a scenario step action by action', async () => {
    const { store, semantic, actions } = setup()
    const step: ScenarioStep = {
      id: 's',
      title: 's',
      description: '',
      actions: [{ kind: 'reset' }, { kind: 'phase', phase: 'hiring' }, { kind: 'open', id: 'a' }, { kind: 'arrive', item: item('n') }],
    }
    await actions.runStep(step)
    expect(semantic.reset).toHaveBeenCalledWith([item('a')])
    expect(store.getState().phase).toBe('hiring')
    expect(semantic.interact).toHaveBeenCalledWith('a', 'open')
    expect(semantic.upsert).toHaveBeenCalledWith([item('n')])
  })

  it('scales with synthetic items built from known vectors, sending the vectors so nothing is re-embedded', () => {
    const { store, semantic, actions } = setup()
    semantic.emitEmbedded([['a', new Float32Array([1, 0])]])
    actions.scale(3)
    const [items, options] = semantic.upsert.mock.calls[0]
    expect(items).toHaveLength(3)
    expect(options.vectors).toHaveLength(3)
    expect(store.getState().items.filter((i) => i.id.startsWith('syn-'))).toHaveLength(3)
    actions.scale(2)
    expect(semantic.upsert.mock.calls[1][0][0].id).toBe('syn-3')
  })

  it('does nothing when scaling before any vectors exist', () => {
    const { semantic, actions } = setup()
    actions.scale(10)
    expect(semantic.upsert).not.toHaveBeenCalled()
  })
})
