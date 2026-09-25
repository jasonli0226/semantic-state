import type { Pokemon, PokemonType } from '../types.ts'
import { spriteUrl } from './sprites.ts'

export function TypeChips({ types }: { types: readonly PokemonType[] }) {
  return (
    <span className="types">
      {types.map((t) => (
        <span key={t} className={`type type-${t}`}>
          {t}
        </span>
      ))}
    </span>
  )
}

export function Sprite({ pokemon, size = 64 }: { pokemon: Pokemon; size?: number }) {
  return <img className="sprite" src={spriteUrl(pokemon.id)} alt="" width={size} height={size} loading="lazy" decoding="async" />
}
