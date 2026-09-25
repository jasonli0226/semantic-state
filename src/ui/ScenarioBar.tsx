import { useState } from 'react'
import { useSelector } from 'react-redux'
import { SCENARIO } from '../app/scenario.ts'
import { selectPhase } from '../app/store.ts'
import { useInboxActions } from './actionsContext.ts'

export function ScenarioBar({ disabled }: { disabled: boolean }) {
  const actions = useInboxActions()
  const phase = useSelector(selectPhase)
  const [activeId, setActiveId] = useState(SCENARIO[0].id)
  const [running, setRunning] = useState(false)
  const active = SCENARIO.find((step) => step.id === activeId) ?? SCENARIO[0]

  const run = async (id: string) => {
    const step = SCENARIO.find((s) => s.id === id)
    if (!step) return
    setActiveId(id)
    setRunning(true)
    try {
      await actions.runStep(step)
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="scenario" aria-label="Scripted demo">
      <ol className="steps">
        {SCENARIO.map((step) => (
          <li key={step.id}>
            <button type="button" aria-pressed={step.id === activeId} disabled={disabled || running} onClick={() => run(step.id)}>
              {step.title}
            </button>
          </li>
        ))}
      </ol>
      <p className="step-desc">
        <span className="phase">Focus: {phase}</span>
        {active.description}
      </p>
    </section>
  )
}
