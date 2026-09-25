import type { CommitPolicy } from 'semantic-state'
import { useSemantic, useSemanticSnapshot, useSemanticStore, useSimilar } from 'semantic-state/react'
import { useCallback, useMemo, useState } from 'react'
import { DEFAULT_WEIGHTS, type Pokemon, type SimilarityWeights } from './types.ts'
import { DetailCard } from './ui/DetailCard.tsx'
import { DexGrid } from './ui/DexGrid.tsx'
import { InterestChips } from './ui/InterestChips.tsx'
import { RankedPanel } from './ui/RankedPanel.tsx'
import { SearchBar } from './ui/SearchBar.tsx'

const SIMILAR_COUNT = 6

/** No Redux, no second store: the dex is static data, everything semantic comes from semantic-state. */
export default function PokedexApp({ pokedex }: { pokedex: readonly Pokemon[] }) {
  const [policy, setPolicy] = useState<CommitPolicy>('onIdle')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const store = useSemanticStore<Pokemon>()
  const snapshot = useSemanticSnapshot<Pokemon>()
  const semantic = useSemantic<Pokemon>(query, { commit: policy })
  const similar = useSimilar<Pokemon>(selectedId, SIMILAR_COUNT)

  const byId = useMemo(() => new Map(pokedex.map((p) => [p.id, p])), [pokedex])
  const weights: SimilarityWeights = { ...DEFAULT_WEIGHTS, ...snapshot.weights }
  const interestWeights = useMemo(() => new Map(semantic.interests.map((i) => [Number(i.id), i.weight])), [semantic.interests])

  const pick = useCallback(
    (id: number) => {
      store.interact(id)
      setSelectedId(id)
    },
    [store],
  )
  const selected = selectedId === null ? undefined : byId.get(selectedId)

  return (
    <>
      <header className="app-head">
        <div className="brand">
          <p className="kicker">
            <a href="./">← Inbox demo</a>
          </p>
          <h1>Semantic Pokédex</h1>
          <p>
            Describe a Pokémon in your own words, or click a few. Ranking happens on this device; the Pokédex itself never
            re-orders.
          </p>
        </div>
        <fieldset className="segmented">
          <legend>Commit policy</legend>
          {(['onIdle', 'manual', 'live'] as const).map((p) => (
            <label key={p}>
              <input type="radio" name="policy" value={p} checked={policy === p} onChange={() => setPolicy(p)} />
              <span>{p === 'onIdle' ? 'On idle' : p === 'manual' ? 'Manual' : 'Live'}</span>
            </label>
          ))}
        </fieldset>
      </header>

      {snapshot.status === 'error' && <p className="banner banner-error">Semantic layer unavailable: {snapshot.error}</p>}

      <SearchBar onSearch={setQuery} model={snapshot.model} weights={weights} onWeights={store.setWeights} />
      <InterestChips interests={semantic.interests} onForget={store.forget} onClear={store.clearInterests} />

      <div className="dex-layout">
        <main>
          <DexGrid pokedex={pokedex} interestWeights={interestWeights} selectedId={selectedId} onPick={pick} />
        </main>
        <aside className="sidebar">
          <RankedPanel
            beliefs={semantic.beliefs}
            query={semantic.resultQuery ?? ''}
            byId={byId}
            pending={semantic.pending}
            manual={policy === 'manual'}
            onCommit={semantic.commit}
            onPick={pick}
            onHover={semantic.pin}
            panelProps={semantic.panelProps}
            stats={{ rankMs: semantic.rankMs, networkRequests: semantic.networkRequests, reorders: semantic.reordersDuringInteraction }}
          />
          {selected && <DetailCard pokemon={selected} similar={similar} onPick={pick} onClose={() => setSelectedId(null)} />}
        </aside>
      </div>
      <p className="footnote">
        Data: PokeAPI. Sprites © Nintendo / Game Freak via the PokeAPI sprites repo — the only network requests besides the
        one-time model download.
      </p>
    </>
  )
}
