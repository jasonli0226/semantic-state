import { STAT_KEYS, type Pokemon } from '../types.ts'
import type { ResultRow } from 'semantic-state'
import { Sprite, TypeChips } from './bits.tsx'
import { artworkUrl, dexNumber } from './sprites.ts'

const STAT_LABELS = { hp: 'HP', attack: 'Atk', defense: 'Def', spAttack: 'SpA', spDefense: 'SpD', speed: 'Spe' } as const
const STAT_MAX = 255

interface DetailCardProps {
  readonly pokemon: Pokemon
  readonly similar: readonly ResultRow<Pokemon>[] | null
  readonly onPick: (id: number) => void
  readonly onClose: () => void
}

export function DetailCard({ pokemon, similar, onPick, onClose }: DetailCardProps) {
  return (
    <section className="detail" aria-label={`${pokemon.name} details`}>
      <button type="button" className="detail-close" onClick={onClose} aria-label="Close details">
        ×
      </button>
      <div className="detail-head">
        <img src={artworkUrl(pokemon.id)} alt={pokemon.name} width={96} height={96} />
        <div>
          <p className="card-no">{dexNumber(pokemon.id)}</p>
          <h2>{pokemon.name}</h2>
          <p className="genus">{pokemon.genus}</p>
          <TypeChips types={pokemon.types} />
        </div>
      </div>
      <p className="flavor">{pokemon.flavor}</p>
      <dl className="statbars">
        {STAT_KEYS.map((key) => (
          <div key={key}>
            <dt>{STAT_LABELS[key]}</dt>
            <dd>
              <span className="bar" style={{ width: `${(pokemon.stats[key] / STAT_MAX) * 100}%` }} />
              <span className="bar-value">{pokemon.stats[key]}</span>
            </dd>
          </div>
        ))}
      </dl>
      <h3>Similar to {pokemon.name}</h3>
      <p className="hint">Nearest neighbours outside its evolution family, using the weights above.</p>
      <ul className="similar">
        {(similar ?? []).map((r) => {
          const other = r.item
          return (
            <li key={other.id}>
              <button type="button" onClick={() => onPick(other.id)} title={`${other.name} — similarity ${r.score.toFixed(2)}`}>
                <Sprite pokemon={other} size={56} />
                <span>{other.name}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
