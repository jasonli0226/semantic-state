import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CommitPolicy } from '../semantic/config.ts'
import { usePokedex } from './usePokedex.ts'
import { DetailCard } from './ui/DetailCard.tsx'
import { DexGrid } from './ui/DexGrid.tsx'
import { InterestChips } from './ui/InterestChips.tsx'
import { RankedPanel } from './ui/RankedPanel.tsx'
import { SearchBar } from './ui/SearchBar.tsx'

export default function PokedexApp() {
  const [policy, setPolicy] = useState<CommitPolicy>('onIdle')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const dex = usePokedex(policy)
  const { click, requestSimilar, weights } = dex

  const pick = useCallback(
    (id: number) => {
      click(id)
      setSelectedId(id)
    },
    [click],
  )

  // "Similar to X" follows the selection and the weight sliders.
  useEffect(() => {
    if (selectedId !== null && dex.status === 'ready') requestSimilar(selectedId)
  }, [selectedId, weights, dex.status, requestSimilar])

  const interestWeights = useMemo(() => new Map(dex.interests.map((i) => [i.pokemon.id, i.weight])), [dex.interests])
  const selected = selectedId === null ? undefined : dex.byId.get(selectedId)
  const similar = dex.similar && dex.similar.id === selectedId ? dex.similar.results : null

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

      {dex.status === 'error' && <p className="banner banner-error">Could not load the Pokédex: {dex.error}</p>}

      <SearchBar onSearch={dex.search} model={dex.model} weights={dex.weights} onWeights={dex.setWeights} />
      <InterestChips interests={dex.interests} onForget={dex.forget} onClear={dex.clear} />

      <div className="dex-layout">
        <main>
          {dex.status !== 'ready' ? <p className="empty">Loading Pokédex…</p> : null}
          <DexGrid pokedex={dex.pokedex} interestWeights={interestWeights} selectedId={selectedId} onPick={pick} />
        </main>
        <aside className="sidebar">
          <RankedPanel
            beliefs={dex.beliefs}
            query={dex.query}
            byId={dex.byId}
            pending={dex.pending}
            manual={policy === 'manual'}
            onCommit={dex.commit}
            onPick={pick}
            onHover={dex.pin}
            panelProps={dex.panelProps}
            stats={{ rankMs: dex.rankMs, networkRequests: dex.networkRequests, reorders: dex.reordersDuringInteraction }}
          />
          {selected && (
            <DetailCard pokemon={selected} similar={similar} byId={dex.byId} onPick={pick} onClose={() => setSelectedId(null)} />
          )}
        </aside>
      </div>
      <p className="footnote">
        Data: PokeAPI. Sprites © Nintendo / Game Freak via the PokeAPI sprites repo — the only network requests besides the
        one-time model download.
      </p>
    </>
  )
}
