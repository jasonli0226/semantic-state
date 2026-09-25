import { createContext, useContext } from 'react'
import type { CommitPolicy } from 'semantic-state'

export interface Settings {
  readonly policy: CommitPolicy
  readonly showAnswerKey: boolean
}

export const SettingsContext = createContext<Settings>({ policy: 'onIdle', showAnswerKey: true })

export const useSettings = () => useContext(SettingsContext)
