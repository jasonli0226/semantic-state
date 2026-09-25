import { createContext, useContext } from 'react'
import type { InboxActions } from '../app/actions.ts'

export const InboxActionsContext = createContext<InboxActions | null>(null)

export function useInboxActions(): InboxActions {
  const actions = useContext(InboxActionsContext)
  if (!actions) throw new Error('useInboxActions must be used inside <InboxActionsContext.Provider>')
  return actions
}
