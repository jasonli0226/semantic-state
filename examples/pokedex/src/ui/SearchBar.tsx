import { useEffect, useState } from 'react'
import { MAX_QUERY_LENGTH, type ModelState } from 'semantic-state'
import type { SimilarityWeights } from '../types.ts'

const DEBOUNCE_MS = 250
const EXAMPLES = ['cute pokemon that lives in the ocean', 'ghost that haunts old houses', 'fast electric mouse', 'giant snake made of rock']
const WEIGHT_LABELS: readonly { key: keyof SimilarityWeights; label: string; hint: string }[] = [
  { key: 'text', label: 'Description', hint: 'Pokédex text embedding: habitat, looks, behaviour' },
  { key: 'type', label: 'Type', hint: 'Shared types' },
  { key: 'stats', label: 'Stats', hint: 'Shape of the base-stat spread (fast glass cannon vs tank)' },
]

function ModelStatus({ model }: { model: ModelState }) {
  switch (model.status) {
    case 'idle':
      return <>Clicks work now. The search model (~23 MB) downloads on your first search, once.</>
    case 'loading':
      return (
        <>
          Downloading search model… {Math.round(model.progress * 100)}% <progress max={1} value={model.progress} />
        </>
      )
    case 'ready':
      return <>Search model ready — runs on this device.</>
    case 'error':
      return <span className="error">Search unavailable ({model.error}). Clicking still works.</span>
  }
}

interface SearchBarProps {
  readonly onSearch: (text: string) => void
  readonly model: ModelState
  readonly weights: SimilarityWeights
  readonly onWeights: (weights: SimilarityWeights) => void
}

export function SearchBar({ onSearch, model, weights, onWeights }: SearchBarProps) {
  const [text, setText] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => onSearch(text), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, onSearch])

  return (
    <section className="searchbar" aria-label="Search and similarity settings">
      <label className="search">
        <span className="visually-hidden">Describe a Pokémon</span>
        <input
          type="search"
          value={text}
          maxLength={MAX_QUERY_LENGTH}
          placeholder="Describe a Pokémon… e.g. “sleepy pink balloon”"
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <p className="examples">
        Try:{' '}
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="link" onClick={() => setText(example)}>
            {example}
          </button>
        ))}
      </p>
      <p className="model-status" role="status">
        <ModelStatus model={model} />
      </p>
      <fieldset className="weights">
        <legend>What counts as “similar” for clicks</legend>
        {WEIGHT_LABELS.map(({ key, label, hint }) => (
          <label key={key} title={hint}>
            <span>
              {label} <output>{weights[key].toFixed(2)}</output>
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.25}
              value={weights[key]}
              onChange={(e) => onWeights({ ...weights, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </fieldset>
    </section>
  )
}
