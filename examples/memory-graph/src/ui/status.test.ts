import { describe, expect, it } from 'vitest'
import { modelNote, searchDisabledReason } from './status.ts'

describe('modelNote', () => {
  it('says that expanding waits for the model while it downloads', () => {
    expect(modelNote({ status: 'loading', progress: 0.4, error: null })).toBe('Loading search model… 40%')
  })

  it('confirms when the model is ready and says nothing before the first search', () => {
    expect(modelNote({ status: 'ready', progress: 1, error: null })).toBe('Search model ready')
    expect(modelNote({ status: 'idle', progress: 0, error: null })).toBeNull()
  })
})

describe('searchDisabledReason', () => {
  it('explains a stopped worker first, then a failed model, else nothing', () => {
    const ok = { status: 'ready' as const, progress: 1, error: null }
    expect(searchDisabledReason('error', 'boom', ok)).toBe('Search unavailable: the worker stopped (boom)')
    expect(searchDisabledReason('ready', null, { status: 'error', progress: 0, error: 'offline' })).toBe('Search unavailable: offline')
    expect(searchDisabledReason('ready', null, ok)).toBeNull()
  })
})
