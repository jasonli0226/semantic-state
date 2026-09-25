import { type PayloadAction, configureStore, createSelector, createSlice } from '@reduxjs/toolkit'
import { type Centroid, EMPTY_CENTROID, observe } from '../core/centroid.ts'
import { collapseDuplicates, groupDuplicates } from '../core/dedupe.ts'
import { rankItems } from '../core/rank.ts'
import { rankByRules } from '../core/rules.ts'
import type { Item, Phase, RankedItem, Vec } from '../core/types.ts'
import { DEMO_NOW } from '../data/dataset.ts'
import type { EmbeddedEvent } from '../semantic/engine.ts'
import { INTERACTION_STRENGTH } from '../semantic/config.ts'

/**
 * The traditional state: items, what was opened / done, the scenario phase.
 * It also hosts the Redux baseline — the same semantic ranking done the "just a selector" way.
 */
export interface InboxState {
  readonly items: readonly Item[]
  readonly vectors: Readonly<Record<string, Vec>>
  readonly centroid: Centroid
  readonly queryVec: Vec | null
  readonly seen: readonly string[]
  readonly done: readonly string[]
  readonly phase: Phase
}

const initialState = (items: readonly Item[]): InboxState => ({
  items,
  vectors: {},
  centroid: EMPTY_CENTROID,
  queryVec: null,
  seen: [],
  done: [],
  phase: 'payments',
})

const isSynthetic = (id: string) => id.startsWith('syn-')

function interacted(state: InboxState, id: string, kind: 'open' | 'done'): InboxState {
  const vector = state.vectors[id]
  return {
    ...state,
    centroid: vector ? observe(state.centroid, vector, INTERACTION_STRENGTH[kind]) : state.centroid,
    seen: state.seen.includes(id) ? state.seen : [...state.seen, id],
    done: kind === 'done' ? [...state.done, id] : state.done,
  }
}

export const inbox = createSlice({
  name: 'inbox',
  initialState: initialState([]),
  reducers: {
    reset: (state, { payload }: PayloadAction<readonly Item[]>) => ({
      ...initialState(payload),
      queryVec: state.queryVec,
      vectors: Object.fromEntries(Object.entries(state.vectors).filter(([id]) => !isSynthetic(id))),
    }),
    arrived: (state, { payload }: PayloadAction<Item>) =>
      state.items.some((i) => i.id === payload.id) ? state : { ...state, items: [payload, ...state.items] },
    vectorsEmbedded: (state, { payload }: PayloadAction<EmbeddedEvent>) => ({
      ...state,
      items: payload.synthetic.length > 0 ? [...state.items, ...payload.synthetic] : state.items,
      vectors: { ...state.vectors, ...Object.fromEntries(payload.vectors.map((v) => [v.id, v.vector])) },
    }),
    queryEmbedded: (state, { payload }: PayloadAction<Vec>) => ({ ...state, queryVec: payload }),
    opened: (state, { payload }: PayloadAction<string>) => interacted(state, payload, 'open'),
    completed: (state, { payload }: PayloadAction<string>) => interacted(state, payload, 'done'),
    phaseChanged: (state, { payload }: PayloadAction<Phase>) => ({ ...state, phase: payload }),
  },
})

export function createAppStore(items: readonly Item[]) {
  return configureStore({
    reducer: { inbox: inbox.reducer },
    preloadedState: { inbox: initialState(items) },
    // Typed-array vectors and 10k-item lists: the dev-mode checks would dominate the measurement.
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  })
}

export type AppStore = ReturnType<typeof createAppStore>
export type RootState = ReturnType<AppStore['getState']>

const selectInbox = (state: RootState) => state.inbox
const selectItems = (state: RootState) => state.inbox.items
const selectDone = (state: RootState) => state.inbox.done

export const selectActiveItems = createSelector([selectItems, selectDone], (items, done) => {
  const doneSet = new Set(done)
  return items.filter((item) => !doneSet.has(item.id))
})

export interface Ranking {
  readonly ranked: readonly RankedItem[]
  readonly rankMs: number
}

export const selectRulesRanking = createSelector([selectActiveItems], (items): Ranking => {
  const started = performance.now()
  const ranked = rankByRules(items, DEMO_NOW)
  return { ranked, rankMs: performance.now() - started }
})

/** The Redux way: recompute the full semantic ranking synchronously, on the main thread, on every change. */
export const selectBaselineRanking = createSelector(
  [selectActiveItems, (s: RootState) => s.inbox.vectors, (s: RootState) => s.inbox.centroid, (s: RootState) => s.inbox.queryVec, (s: RootState) => s.inbox.seen],
  (items, vectors, centroid, queryVec, seen): Ranking => {
    const started = performance.now()
    const getVector = (id: string) => vectors[id]
    const ranked = rankItems(items, { getVector, queryVec, centroid, now: DEMO_NOW, seen: new Set(seen) })
    const order = ranked.map((r) => r.id)
    const visible = new Set(collapseDuplicates(order, groupDuplicates(order, getVector)))
    return { ranked: ranked.filter((r) => visible.has(r.id)), rankMs: performance.now() - started }
  },
)

export const selectItemsById = createSelector([selectItems], (items) => new Map(items.map((item) => [item.id, item])))
export const selectPhase = (state: RootState) => selectInbox(state).phase
export const selectSeen = createSelector([(s: RootState) => s.inbox.seen], (seen) => new Set(seen))
