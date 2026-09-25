import { z } from 'zod'
import { HOUR } from '../core/time.ts'
import type { Item, Phase } from '../core/types.ts'
import raw from './inbox.json' with { type: 'json' }

/**
 * The demo inbox lives in inbox.json. Times are relative to `demoNow` (a frozen clock, so runs are
 * reproducible); `topic` + `actionable` are the answer key and never reach the ranking code.
 */

const PHASES = ['payments', 'hiring'] as const satisfies readonly Phase[]

const SeedSchema = z.object({
  id: z.string().min(1),
  topic: z.enum([...PHASES, 'other', 'noise']),
  /** Ground truth: a person focused on `topic` would want this near the top. */
  actionable: z.boolean(),
  source: z.enum(['github', 'ci', 'slack', 'calendar', 'email', 'jira']),
  sender: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  labels: z.array(z.string()),
  dueInHours: z.number().optional(),
  ageHours: z.number().min(0),
})

const DatasetSchema = z.object({
  demoNow: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO date-time'),
  items: z.array(SeedSchema),
  arrivals: z.record(z.string(), SeedSchema),
})

type Seed = z.infer<typeof SeedSchema>

export interface Dataset {
  readonly now: number
  readonly items: readonly Item[]
  readonly arrivals: Readonly<Record<string, Item>>
  readonly groundTruth: Readonly<Record<Phase, ReadonlySet<string>>>
}

function toItem(seed: Seed, now: number): Item {
  return {
    id: seed.id,
    source: seed.source,
    sender: seed.sender,
    title: seed.title,
    body: seed.body,
    labels: seed.labels,
    dueAt: seed.dueInHours === undefined ? null : now + seed.dueInHours * HOUR,
    createdAt: now - seed.ageHours * HOUR,
  }
}

export function parseDataset(input: unknown): Dataset {
  const result = DatasetSchema.safeParse(input)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n')
    throw new Error(`Invalid inbox.json:\n${issues}`)
  }
  const data = result.data
  const seeds = [...data.items, ...Object.values(data.arrivals)]
  const seenIds = new Set<string>()
  for (const { id } of seeds) {
    if (seenIds.has(id)) throw new Error(`Invalid inbox.json: duplicate id "${id}"`)
    seenIds.add(id)
  }

  const now = Date.parse(data.demoNow)
  const truth = (phase: Phase) => new Set(seeds.filter((s) => s.topic === phase && s.actionable).map((s) => s.id))
  return {
    now,
    items: data.items.map((seed) => toItem(seed, now)),
    arrivals: Object.fromEntries(Object.entries(data.arrivals).map(([name, seed]) => [name, toItem(seed, now)])),
    groundTruth: { payments: truth('payments'), hiring: truth('hiring') },
  }
}

const dataset = parseDataset(raw)

function requireArrival(name: string): Item {
  const item = dataset.arrivals[name]
  if (!item) throw new Error(`Invalid inbox.json: missing arrival "${name}"`)
  return item
}

/** Monday 2026-09-28 09:00 HKT unless inbox.json says otherwise. */
export const DEMO_NOW = dataset.now
export const initialItems = dataset.items
export const groundTruth = dataset.groundTruth

/** Items that arrive during the scripted demo (steps 3 and 4). */
export const ARRIVALS = { refund: requireArrival('refund'), spam: requireArrival('spam') } as const

/** Text that gets embedded for an item. */
export const embeddingText = (item: Item) => `${item.title}. ${item.body}`
