import { type Id, type Vec, normalizeQuery } from 'semantic-state'
import { COMMIT_DEFAULTS, useSemantic, useSemanticStore } from 'semantic-state/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { K, LANE_COUNT, MIN_QUERY_SIMILARITY, TRAIL_FADE, TRAIL_LENGTH } from './config.ts'
import { assignLanes, encode } from './graph/encoding.ts'
import { type ExpandedOrder, expand, pickSearchSeed, trail } from './graph/explored.ts'
import type { Point } from './graph/mapLayout.ts'
import { useHeldVisuals } from './graph/useHeldVisuals.ts'
import { useNeighbors } from './graph/useNeighbors.ts'
import { type Article, DEFAULT_WEIGHTS } from './types.ts'
import { Attribution } from './ui/Attribution.tsx'
import { Controls } from './ui/Controls.tsx'
import { GraphView, type TrailEdge } from './ui/GraphView.tsx'
import { NodeDetail } from './ui/NodeDetail.tsx'
import { modelNote, searchDisabledReason } from './ui/status.ts'

interface Props {
  readonly articles: readonly Article[]
  /** Text vectors by article id, for matching a search against the query alone. */
  readonly vectors: ReadonlyMap<number, Vec>
  /** Fixed map position by article id. */
  readonly positions: ReadonlyMap<number, Point>
  readonly seedId: number
  readonly loadMs: number
}

const prefersMotion = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches
const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)

export default function App({ articles, vectors, positions, seedId, loadMs }: Props) {
  const store = useSemanticStore<Article>()
  const byId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles])
  const ids = useMemo(() => articles.map((a) => a.id), [articles])
  const titleOf = useCallback((id: Id) => byId.get(Number(id))?.title ?? String(id), [byId])
  const [order, setOrder] = useState<ExpandedOrder>(() => [seedId])
  const [selected, setSelected] = useState<number>(seedId)
  const [query, setQuery] = useState('')
  const [awaitingSeed, setAwaitingSeed] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [topicWeight, setTopicWeight] = useState(DEFAULT_WEIGHTS.topic)
  const [announcement, setAnnouncement] = useState('')
  const [lanes, setLanes] = useState<ReadonlyMap<Id, number>>(() => new Map())
  const [queryVectors, setQueryVectors] = useState<ReadonlyMap<string, Vec>>(() => new Map())
  const [cameraTarget, setCameraTarget] = useState<{ id: number; seq: number } | null>(null)
  const [animate] = useState(prefersMotion)
  const seeded = useRef(false)

  // The seed counts as a click, so the first frame already shows colour. Guarded for StrictMode's double effect.
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    store.interact(seedId)
  }, [store, seedId])

  // The worker embeds each query once and caches it, so keep every vector it sends.
  useEffect(() => store.onQueryEmbedded((q, vector) => setQueryVectors((m) => new Map(m).set(q, vector))), [store])

  const { beliefs, interests, model, rankMs, status, error } = useSemantic<Article>(query)
  const trailIds = useMemo(() => trail(order, TRAIL_LENGTH), [order])
  const { neighboursOf, edges } = useNeighbors(trailIds, K)
  const trailEdges = useMemo((): TrailEdge[] => {
    const recency = new Map(trailIds.map((id, i) => [id, i]))
    const newest = trailIds.length - 1
    return edges.map((e) => {
      const at = Math.max(recency.get(e.source) ?? -1, recency.get(e.target) ?? -1)
      return { ...e, opacity: TRAIL_FADE ** (newest - at) }
    })
  }, [edges, trailIds])
  const similarityOf = useMemo(() => new Map(edges.map((e) => [edgeKey(e.source, e.target), e.similarity])), [edges])
  const nearest = useMemo(
    () => (neighboursOf.get(selected) ?? []).map((id) => ({ id, title: titleOf(id), similarity: similarityOf.get(edgeKey(selected, id)) ?? 0 })),
    [neighboursOf, selected, titleOf, similarityOf],
  )

  const nextLanes = assignLanes(lanes, interests.map((i) => i.id), LANE_COUNT)
  if (nextLanes !== lanes) setLanes(nextLanes)

  const fresh = useMemo(() => {
    const beliefById = new Map(beliefs.map((b) => [b.value.id, b]))
    const weightById = new Map(interests.map((i) => [Number(i.id), i.weight]))
    const ctx = { query, lanes: nextLanes, titleOf }
    return new Map(ids.map((id) => [id, encode(id, { belief: beliefById.get(id), interestWeight: weightById.get(id) }, ctx)]))
  }, [ids, beliefs, interests, query, nextLanes, titleOf])
  const selectedOnly = useMemo(() => new Set([selected]), [selected])
  const held = useHeldVisuals(fresh, COMMIT_DEFAULTS.idleMs, selectedOnly)

  const activate = useCallback(
    (id: number) => {
      setOrder((o) => expand(o, id))
      setSelected(id)
      store.interact(id)
      setAnnouncement(`Explored ${titleOf(id)}: its ${K} nearest articles are linked on the map`)
    },
    [store, titleOf],
  )

  // After a search is submitted, the article that best matches the query text is explored and the camera goes there.
  const queryVec = queryVectors.get(normalizeQuery(query))
  useEffect(() => {
    if (!awaitingSeed || !queryVec) return
    // oxlint-disable-next-line react/set-state-in-effect
    setAwaitingSeed(false)
    const pick = pickSearchSeed(queryVec, vectors, MIN_QUERY_SIMILARITY)
    if (pick.kind === 'seed') {
      activate(pick.id)
      setCameraTarget((c) => ({ id: pick.id, seq: (c?.seq ?? 0) + 1 }))
    } else setHint(`Only weak matches for “${query}”`)
  }, [awaitingSeed, queryVec, vectors, activate, query])

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

  const summary = `${articles.length} articles · trail of your last ${trailIds.length} ${trailIds.length === 1 ? 'click' : 'clicks'}`

  return (
    <div className="app">
      <header>
        <h1>Memory graph</h1>
        <p>Every article on one map. Click one: related articles light up everywhere, and its nearest neighbours are linked.</p>
      </header>
      <GraphView
        ids={ids}
        positions={positions}
        edges={trailEdges}
        visuals={held.visuals}
        titleOf={titleOf}
        selected={selected}
        onActivate={activate}
        panelProps={held.panelProps}
        animate={animate}
        cameraTarget={cameraTarget}
      />
      <aside className="side">
        <Controls
          onSearch={onSearch}
          searchDisabledReason={searchDisabledReason(status, error, model)}
          modelNote={modelNote(model)}
          hint={hint}
          topicWeight={topicWeight}
          onTopicWeight={onTopicWeight}
          pending={held.pending}
          summary={summary}
          onReset={onReset}
        />
        <NodeDetail article={byId.get(selected)} visual={held.visuals.get(selected)} neighbours={nearest} onActivate={activate} />
      </aside>
      <footer>
        <Attribution /> · data {loadMs} ms · ranked in {rankMs === null ? '–' : `${rankMs.toFixed(1)} ms`}
      </footer>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}
