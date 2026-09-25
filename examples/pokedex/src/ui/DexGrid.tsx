import { memo } from 'react'
import type { Pokemon } from '../types.ts'
import { Sprite, TypeChips } from './bits.tsx'
import { dexNumber } from './sprites.ts'

interface DexGridProps {
  readonly pokedex: readonly Pokemon[]
  /** Clicked Pokémon → current interest weight (0..1). */
  readonly interestWeights: ReadonlyMap<number, number>
  readonly selectedId: number | null
  readonly onPick: (id: number) => void
}

/** The main list stays in Pokédex order: people expect #0001 → #1025, so it never re-ranks. */
export const DexGrid = memo(function DexGrid({ pokedex, interestWeights, selectedId, onPick }: DexGridProps) {
  return (
    <ol className="dex" aria-label="Pokédex">
      {pokedex.map((p) => {
        const weight = interestWeights.get(p.id)
        return (
          <li key={p.id}>
            <button
              type="button"
              className={['card', weight !== undefined && 'card-interest', selectedId === p.id && 'card-selected'].filter(Boolean).join(' ')}
              style={weight !== undefined ? { ['--interest' as string]: weight } : undefined}
              onClick={() => onPick(p.id)}
              aria-pressed={weight !== undefined}
            >
              <Sprite pokemon={p} size={72} />
              <span className="card-no">{dexNumber(p.id)}</span>
              <span className="card-name">{p.name}</span>
              <TypeChips types={p.types} />
            </button>
          </li>
        )
      })}
    </ol>
  )
})
