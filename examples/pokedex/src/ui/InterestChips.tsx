import type { InterestRow } from 'semantic-state'
import type { Pokemon } from '../types.ts'
import { Sprite } from './bits.tsx'

interface InterestChipsProps {
  readonly interests: readonly InterestRow<Pokemon>[]
  readonly onForget: (id: number) => void
  readonly onClear: () => void
}

export function InterestChips({ interests, onForget, onClear }: InterestChipsProps) {
  if (interests.length === 0) return null
  return (
    <section className="interests" aria-label="Your clicks">
      <span className="interests-label">Learning from</span>
      <ul>
        {interests.flatMap(({ item: pokemon, weight }) => !pokemon ? [] : [
          <li key={pokemon.id} className="interest" style={{ opacity: 0.45 + weight * 0.55 }} title={`weight ${weight.toFixed(2)} — fades as you click more`}>
            <Sprite pokemon={pokemon} size={28} />
            <span>{pokemon.name}</span>
            <button type="button" onClick={() => onForget(pokemon.id)} aria-label={`Forget ${pokemon.name}`}>
              ×
            </button>
          </li>,
        ])}
      </ul>
      <button type="button" className="link" onClick={onClear}>
        Clear all
      </button>
    </section>
  )
}
