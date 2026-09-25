import { describe, expect, it, vi } from 'vitest'
import type { Item } from '../core/types.ts'
import type { SemanticEngine } from '../semantic/engine.ts'
import { createInboxActions } from './actions.ts'
import type { ScenarioStep } from './scenario.ts'
import { createAppStore } from './store.ts'

const item = (id: string): Item => ({ id, source: 'email', sender: 's', title: id, body: '', labels: [], dueAt: null, createdAt: 0 })

function fakeEngine() {
  return {
    reset: vi.fn(),
    upsert: vi.fn(),
    interact: vi.fn(),
    scale: vi.fn(),
  } as unknown as SemanticEngine & Record<'reset' | 'upsert' | 'interact' | 'scale', ReturnType<typeof vi.fn>>
}

function setup() {
  const store = createAppStore([item('a')])
  const engine = fakeEngine()
  const actions = createInboxActions(store, engine, [item('a')], { stepDelayMs: 0 })
  return { store, engine, actions }
}

describe('inbox actions', () => {
  it('sends every interaction to both Redux and the semantic engine', () => {
    const { store, engine, actions } = setup()
    actions.open('a')
    actions.complete('a')
    expect(engine.interact).toHaveBeenNthCalledWith(1, 'a', 'open')
    expect(engine.interact).toHaveBeenNthCalledWith(2, 'a', 'done')
    expect(store.getState().inbox.done).toEqual(['a'])
  })

  it('embeds arriving items through the engine', () => {
    const { store, engine, actions } = setup()
    actions.arrive(item('n'))
    expect(engine.upsert).toHaveBeenCalledWith([item('n')])
    expect(store.getState().inbox.items[0].id).toBe('n')
  })

  it('runs a scenario step action by action', async () => {
    const { store, engine, actions } = setup()
    const step: ScenarioStep = {
      id: 's',
      title: 's',
      description: '',
      actions: [{ kind: 'reset' }, { kind: 'phase', phase: 'hiring' }, { kind: 'open', id: 'a' }, { kind: 'arrive', item: item('n') }],
    }
    await actions.runStep(step)
    expect(engine.reset).toHaveBeenCalledWith([item('a')])
    expect(store.getState().inbox.phase).toBe('hiring')
    expect(engine.interact).toHaveBeenCalledWith('a', 'open')
    expect(engine.upsert).toHaveBeenCalledWith([item('n')])
  })

  it('asks the engine for synthetic items when scaling', () => {
    const { engine, actions } = setup()
    actions.scale(1000)
    expect(engine.scale).toHaveBeenCalledWith(1000)
  })
})
