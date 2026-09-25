import { createSemanticStore } from 'semantic-state'
import { SemanticProvider } from 'semantic-state/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { createInboxActions } from './app/actions.ts'
import { createInboxStore } from './app/inboxStore.ts'
import type { Item } from './core/types.ts'
import { initialItems } from './data/dataset.ts'
import './index.css'
import { InboxActionsContext, InboxStoreContext } from './ui/actionsContext.ts'

const STEP_DELAY_MS = 600

const store = createInboxStore(initialItems)
const semantic = createSemanticStore<Item>(new Worker(new URL('./semantic/semantic.worker.ts', import.meta.url), { type: 'module' }))

const actions = createInboxActions(store, semantic, initialItems, { stepDelayMs: STEP_DELAY_MS })
semantic.upsert(initialItems)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InboxStoreContext.Provider value={store}>
      <SemanticProvider store={semantic}>
        <InboxActionsContext.Provider value={actions}>
          <App />
        </InboxActionsContext.Provider>
      </SemanticProvider>
    </InboxStoreContext.Provider>
  </StrictMode>,
)
