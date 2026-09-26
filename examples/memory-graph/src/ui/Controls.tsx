import { type FormEvent, useState } from 'react'

interface Props {
  readonly onSearch: (query: string) => void
  readonly searchDisabledReason: string | null
  readonly modelNote: string | null
  readonly hint: string | null
  readonly topicWeight: number
  readonly onTopicWeight: (weight: number) => void
  readonly pending: number
  readonly summary: string
  readonly onReset: () => void
}

export function Controls({ onSearch, searchDisabledReason, modelNote, hint, topicWeight, onTopicWeight, pending, summary, onReset }: Props) {
  const [text, setText] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSearch(text)
  }
  return (
    <section className="controls" aria-label="Controls">
      <form role="search" onSubmit={submit}>
        <input
          type="search"
          aria-label="Search articles"
          placeholder="Search by meaning, e.g. “volcanoes and earthquakes”"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={searchDisabledReason !== null}
        />
      </form>
      {searchDisabledReason && <p className="note">{searchDisabledReason}</p>}
      {modelNote && <p className="note">{modelNote}</p>}
      {hint && <p className="note">{hint}</p>}
      <label>
        Topic weight {topicWeight.toFixed(1)}
        <input type="range" min={0} max={1} step={0.1} value={topicWeight} onChange={(e) => onTopicWeight(Number(e.target.value))} style={{ width: '100%' }} />
      </label>
      <p className="note">
        {summary} {pending > 0 && <span className="chip">{pending} {pending === 1 ? 'change' : 'changes'} pending</span>}
      </p>
      <button type="button" onClick={onReset}>
        Reset
      </button>
    </section>
  )
}
