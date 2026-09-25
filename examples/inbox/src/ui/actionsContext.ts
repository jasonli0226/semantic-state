import { createContext, useContext, useSyncExternalStore } from 'react'
import type { InboxActions } from '../app/actions.ts'
import type { InboxState, InboxStore } from '../app/inboxStore.ts'

export const InboxActionsContext = createContext<InboxActions | null>(null)
export const InboxStoreContext = createContext<InboxStore | null>(null)

export function useInboxActions(): InboxActions {
  const actions = useContext(InboxActionsContext)
  if (!actions) throw new Error('useInboxActions must be used inside <InboxActionsContext.Provider>')
  return actions
}

export function useInboxState(): InboxState {
  const store = useContext(InboxStoreContext)
  if (!store) throw new Error('useInboxState must be used inside <InboxStoreContext.Provider>')
  return useSyncExternalStore(store.subscribe, store.getState)
}
