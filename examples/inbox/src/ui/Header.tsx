import { activeItems } from '../app/inboxStore.ts'
import { REPO_URL } from '../links.ts'
import type { CommitPolicy } from 'semantic-state'
import { useInboxActions, useInboxState } from './actionsContext.ts'
import { useLongTasks } from './useLongTasks.ts'

const POLICIES: readonly { value: CommitPolicy; label: string; hint: string }[] = [
  { value: 'onIdle', label: 'On idle', hint: 'Apply the new order after 2s without activity in the panel, or when the pointer leaves' },
  { value: 'manual', label: 'Manual', hint: 'Show "N moved up · Refresh" and wait for the user' },
  { value: 'live', label: 'Live', hint: 'Apply immediately (demo only — rows move under the cursor)' },
]

const SCALES = [1_000, 10_000] as const

interface HeaderProps {
  readonly policy: CommitPolicy
  readonly onPolicy: (policy: CommitPolicy) => void
  readonly showAnswerKey: boolean
  readonly onShowAnswerKey: (show: boolean) => void
  readonly engineReady: boolean
}

export function Header({ policy, onPolicy, showAnswerKey, onShowAnswerKey, engineReady }: HeaderProps) {
  const actions = useInboxActions()
  const itemCount = activeItems(useInboxState()).length
  const longTasks = useLongTasks()

  return (
    <header className="app-head">
      <div className="brand">
        <p className="kicker">
          <a href={REPO_URL}>semantic-state example</a>
        </p>
        <h1>Semantic state</h1>
        <p>Dev inbox, Monday morning — hand-written rules vs a semantic layer (semantic-state). Everything runs on this device.</p>
      </div>
      <div className="controls">
        <fieldset className="segmented">
          <legend>Commit policy</legend>
          {POLICIES.map((p) => (
            <label key={p.value} title={p.hint}>
              <input type="radio" name="policy" value={p.value} checked={policy === p.value} onChange={() => onPolicy(p.value)} />
              <span>{p.label}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="scale">
          <legend>Scale test · {itemCount.toLocaleString()} items</legend>
          {SCALES.map((n) => (
            <button key={n} type="button" disabled={!engineReady} onClick={() => actions.scale(n)}>
              +{n.toLocaleString()}
            </button>
          ))}
        </fieldset>
        <label className="toggle">
          <input type="checkbox" checked={showAnswerKey} onChange={(e) => onShowAnswerKey(e.target.checked)} />
          <span>Answer key</span>
        </label>
        <p className="longtasks" title="Main-thread tasks over 50ms since page load (Chromium only)">
          {longTasks.supported ? `Long tasks: ${longTasks.count} (max ${Math.round(longTasks.maxMs)} ms)` : 'Long tasks: n/a in this browser'}
        </p>
      </div>
    </header>
  )
}
