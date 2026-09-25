import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import App from './App.tsx'
import { createInboxActions } from './app/actions.ts'
import { createAppStore, inbox } from './app/store.ts'
import { initialItems } from './data/dataset.ts'
import './index.css'
import { ATTENTION_QUERY } from './semantic/config.ts'
import { SemanticEngineContext } from './semantic/context.ts'
import { createSemanticEngine } from './semantic/engine.ts'
import { InboxActionsContext } from './ui/actionsContext.ts'

const STEP_DELAY_MS = 600

const store = createAppStore(initialItems)
const worker = new Worker(new URL('./semantic/semantic.worker.ts', import.meta.url), { type: 'module' })
const engine = createSemanticEngine(worker)

// The Redux baseline reuses the worker's embeddings, so the comparison isolates the ranking/update path.
engine.onEmbedded((event) => store.dispatch(inbox.actions.vectorsEmbedded(event)))
engine.onQueryEmbedded((query, vector) => {
  if (query === ATTENTION_QUERY) store.dispatch(inbox.actions.queryEmbedded(vector))
})

const actions = createInboxActions(store, engine, initialItems, { stepDelayMs: STEP_DELAY_MS })
engine.start(initialItems)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <SemanticEngineContext.Provider value={engine}>
        <InboxActionsContext.Provider value={actions}>
          <App />
        </InboxActionsContext.Provider>
      </SemanticEngineContext.Provider>
    </Provider>
  </StrictMode>,
)
