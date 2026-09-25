import type { CommitPolicy } from 'semantic-state'
import { COMMIT_DEFAULTS, useSemanticSnapshot } from 'semantic-state/react'
import { useMemo, useState } from 'react'
import { Header } from './ui/Header.tsx'
import { RulesPanel } from './ui/RulesPanel.tsx'
import { ScenarioBar } from './ui/ScenarioBar.tsx'
import { SemanticPanel } from './ui/SemanticPanel.tsx'
import { SettingsContext } from './ui/settings.ts'

export default function App() {
  const [policy, setPolicy] = useState<CommitPolicy>(COMMIT_DEFAULTS.policy)
  const [showAnswerKey, setShowAnswerKey] = useState(true)
  const settings = useMemo(() => ({ policy, showAnswerKey }), [policy, showAnswerKey])
  // Ready once the model has embedded the inbox.
  const ready = useSemanticSnapshot().model.status === 'ready'

  return (
    <SettingsContext.Provider value={settings}>
      <Header policy={policy} onPolicy={setPolicy} showAnswerKey={showAnswerKey} onShowAnswerKey={setShowAnswerKey} engineReady={ready} />
      <main>
        <ScenarioBar disabled={!ready} />
        <div className="panels">
          <RulesPanel />
          <SemanticPanel />
        </div>
        <p className="footnote">
          Click a row to open it (feeds the attention centroid) · ✓ marks it done · hover a semantic row to pin it in place ·
          <span className="truth" aria-hidden="true" /> = answer key for the current focus
        </p>
      </main>
    </SettingsContext.Provider>
  )
}
