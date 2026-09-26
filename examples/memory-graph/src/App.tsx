import { type Id, normalizeQuery } from 'semantic-state'
import { COMMIT_DEFAULTS, useSemantic, useSemanticSnapshot, useSemanticStore } from 'semantic-state/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { K, LANE_COUNT, NODE_CAP, WEAK_MATCH } from './config.ts'
import { assignLanes, encode } from './graph/encoding.ts'
import { type ExpandedOrder, enforceCap, expand, pickSearchSeed, visibleNodes } from './graph/explored.ts'
import { useHeldVisuals } from './graph/useHeldVisuals.ts'
import { useNeighbors } from './graph/useNeighbors.ts'
import { type Article, DEFAULT_WEIGHTS } from './types.ts'
import { Controls } from './ui/Controls.tsx'
import { GraphView } from './ui/GraphView.tsx'
import { NodeDetail } from './ui/NodeDetail.tsx'

interface Props {
  readonly articles: readonly Article[]
  readonly seedId: number
  readonly loadMs: number
}

const prefersMotion = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function App({ articles, seedId, loadMs }: Props) {
  const store = useSemanticStore<Article>()
  const byId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles])
  const titleOf = useCallback((id: Id) => byId.get(Number(id))?.title ?? String(id), [byId])
  const [order, setOrder] = useState<ExpandedOrder>(() => [seedId])
  const [selected, setSelected] = useState<number>(seedId)
  const [query, setQuery] = useState('')
  const [awaitingSeed, setAwaitingSeed] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [topicWeight, setTopicWeight] = useState(DEFAULT_WEIGHTS.topic)
  const [announcement, setAnnouncement] = useState('')
  const [lanes, setLanes] = useState<ReadonlyMap<Id, number>>(() => new Map())
  const [animate] = useState(prefersMotion)
  const seeded = useRef(false)

  // The seed counts as a click, so the first frame already shows colour. Guarded for StrictMode's double effect.
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    store.interact(seedId)
  }, [store, seedId])

  const { beliefs, interests, model, rankMs, status, error } = useSemantic<Article>(query)
  const { results } = useSemanticSnapshot<Article>()
  const { neighboursOf, edges } = useNeighbors(order, K)
  const shownOrder = useMemo(() => enforceCap(order, neighboursOf, NODE_CAP), [order, neighboursOf])
  const nodes = useMemo(() => visibleNodes(shownOrder, neighboursOf), [shownOrder, neighboursOf])
  const shownEdges = useMemo(() => {
    const visible = new Set(nodes.map((n) => n.id))
    return edges.filter((e) => visible.has(e.source) && visible.has(e.target))
  }, [nodes, edges])

  const nextLanes = assignLanes(lanes, interests.map((i) => i.id), LANE_COUNT)
  if (nextLanes !== lanes) setLanes(nextLanes)

  const fresh = useMemo(() => {
    const beliefById = new Map(beliefs.map((b) => [b.value.id, b]))
    const weightById = new Map(interests.map((i) => [Number(i.id), i.weight]))
    const ctx = { query, lanes: nextLanes, titleOf }
    return new Map(nodes.map((n) => [n.id, encode(n.id, { belief: beliefById.get(n.id), interestWeight: weightById.get(n.id) }, ctx)]))
  }, [nodes, beliefs, interests, query, nextLanes, titleOf])
  const held = useHeldVisuals(fresh, COMMIT_DEFAULTS.idleMs)

  const activate = useCallback(
    (id: number) => {
      setOrder((o) => expand(o, id))
      setSelected(id)
      store.interact(id)
      setAnnouncement(`Expanded ${titleOf(id)}, showing its ${K} nearest articles`)
    },
    [store, titleOf],
  )

  // After a search is submitted, its best confident match becomes the next expanded article.
  const result = results[normalizeQuery(query)]
  useEffect(() => {
    if (!awaitingSeed || !result) return
    // oxlint-disable-next-line react/set-state-in-effect
    setAwaitingSeed(false)
    const pick = pickSearchSeed(result.ranked, WEAK_MATCH)
    if (pick.kind === 'seed') activate(pick.id)
    else setHint(`Only weak matches for “${query}”`)
  }, [awaitingSeed, result, activate, query])

  const onSearch = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    setQuery(text)
    setHint(null)
    setAwaitingSeed(true)
  }
  const onTopicWeight = (weight: number) => {
    setTopicWeight(weight)
    store.setWeights({ ...DEFAULT_WEIGHTS, topic: weight })
  }
  const onReset = () => {
    store.clearInterests()
    setOrder([seedId])
    setSelected(seedId)
    setQuery('')
    setHint(null)
    setAnnouncement(`Reset to ${titleOf(seedId)}`)
  }

  const modelNote =
    model.status === 'loading' ? `Loading search model… ${Math.round(model.progress * 100)}%` : model.status === 'ready' ? 'Search model ready' : null
  const searchDisabledReason =
    status === 'error'
      ? `Search unavailable: the worker stopped (${error ?? 'unknown error'})`
      : model.status === 'error'
        ? `Search unavailable: ${model.error ?? 'model failed to load'}`
        : null

  return (
    <div className="app">
      <header>
        <h1>Memory graph</h1>
        <p>Click an article to expand its nearest neighbours by meaning. What you explore changes what stands out.</p>
      </header>
      <GraphView
        nodes={nodes}
        edges={shownEdges}
        visuals={held.visuals}
        titleOf={titleOf}
        selected={selected}
        onActivate={activate}
        panelProps={held.panelProps}
        animate={animate}
      />
      <aside className="side">
        <Controls
          onSearch={onSearch}
          searchDisabledReason={searchDisabledReason}
          modelNote={modelNote}
          hint={hint}
          topicWeight={topicWeight}
          onTopicWeight={onTopicWeight}
          pending={held.pending}
          nodeCount={nodes.length}
          capped={shownOrder.length < order.length}
          onReset={onReset}
        />
        <NodeDetail article={byId.get(selected)} visual={held.visuals.get(selected)} />
      </aside>
      <footer>
        Text from <a href="https://en.wikipedia.org/wiki/Wikipedia:Vital_articles/Level/3">Wikipedia</a>, CC BY-SA 4.0 · {articles.length} articles ·
        data {loadMs} ms · ranked in {rankMs === null ? '–' : `${rankMs.toFixed(1)} ms`}
      </footer>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}
