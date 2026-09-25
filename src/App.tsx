import { useMemo, useState, useSyncExternalStore } from 'react'
import type { CommitPolicy } from './semantic/config.ts'
import { COMMIT_DEFAULTS } from './semantic/config.ts'
import { useSemanticEngine } from './semantic/context.ts'
import { BaselinePanel } from './ui/BaselinePanel.tsx'
import { Header } from './ui/Header.tsx'
import { RulesPanel } from './ui/RulesPanel.tsx'
import { ScenarioBar } from './ui/ScenarioBar.tsx'
import { SemanticPanel } from './ui/SemanticPanel.tsx'
import { SettingsContext } from './ui/settings.ts'

export default function App() {
  const [policy, setPolicy] = useState<CommitPolicy>(COMMIT_DEFAULTS.policy)
  const [showAnswerKey, setShowAnswerKey] = useState(true)
  const settings = useMemo(() => ({ policy, showAnswerKey }), [policy, showAnswerKey])
  const engine = useSemanticEngine()
  const ready = useSyncExternalStore(engine.subscribe, () => engine.getSnapshot().status === 'ready')

  return (
    <SettingsContext.Provider value={settings}>
      <Header policy={policy} onPolicy={setPolicy} showAnswerKey={showAnswerKey} onShowAnswerKey={setShowAnswerKey} engineReady={ready} />
      <main>
        <ScenarioBar disabled={!ready} />
        <div className="panels">
          <RulesPanel />
          <SemanticPanel />
          <BaselinePanel />
        </div>
        <p className="footnote">
          Click a row to open it (feeds the attention centroid) · ✓ marks it done · hover a semantic row to pin it in place ·
          <span className="truth" aria-hidden="true" /> = answer key for the current focus
        </p>
      </main>
    </SettingsContext.Provider>
  )
}
