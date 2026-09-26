import type { Belief } from 'semantic-state'
import { SemanticProvider, useSemantic } from 'semantic-state/react'
import { notes } from './store.js'
import type { Note } from './types.js'

function Row({ belief }: { belief: Belief<Note> }) {
  return (
    <li onClick={() => notes.interact(belief.value.id)}>
      {belief.value.title} <small>{belief.reason.kind}</small>
    </li>
  )
}

function Suggestions() {
  const { beliefs, panelProps } = useSemantic<Note>('notes about the launch')
  return <ul {...panelProps}>{beliefs.map((b) => <Row key={b.value.id} belief={b} />)}</ul>
}

export function App() {
  return (
    <SemanticProvider store={notes}>
      <Suggestions />
    </SemanticProvider>
  )
}
