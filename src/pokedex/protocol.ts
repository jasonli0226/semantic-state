import type { Interest, RankedPokemon } from './rank.ts'
import type { Pokemon, SimilarityWeights } from './types.ts'

export type PokedexToWorker =
  | { readonly type: 'init' }
  | { readonly type: 'search'; readonly text: string }
  | { readonly type: 'click'; readonly id: number }
  | { readonly type: 'forget'; readonly id: number }
  | { readonly type: 'clear' }
  | { readonly type: 'weights'; readonly weights: SimilarityWeights }
  | { readonly type: 'similar'; readonly id: number }

export interface PokedexResult {
  readonly ranked: readonly RankedPokemon[]
  /** Representative id → number of evolution-family members folded into it. */
  readonly familyExtras: readonly (readonly [number, number])[]
  readonly interests: readonly Interest[]
  readonly query: string
  readonly rankMs: number
  /** Worker fetches since the model finished loading; null while it has not loaded. */
  readonly networkRequests: number | null
}

export type PokedexFromWorker =
  | { readonly type: 'loaded'; readonly pokedex: readonly Pokemon[] }
  | { readonly type: 'modelProgress'; readonly progress: number }
  | { readonly type: 'modelReady' }
  | { readonly type: 'error'; readonly message: string }
  /** Search is unavailable, but the dex and click similarity keep working. */
  | { readonly type: 'modelError'; readonly message: string }
  | { readonly type: 'ranked'; readonly result: PokedexResult }
  | { readonly type: 'similar'; readonly id: number; readonly results: readonly RankedPokemon[] }
