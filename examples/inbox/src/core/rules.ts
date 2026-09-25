import { urgency } from './time.ts'
import type { Item, RankedItem } from './types.ts'

/** The hand-written ranking a team would ship without a semantic layer. */
export interface RuleConfig {
  readonly vipSenders: readonly string[]
  readonly keywords: RegExp
  /** Titles that usually mean "you need to act": failed builds, review requests. */
  readonly actionTitles: RegExp
}

export const DEFAULT_RULES: RuleConfig = {
  vipSenders: ['Dana (Eng Manager)'],
  keywords: /\b(urgent|asap|critical)\b/i,
  actionTitles: /\b(failed|failing|review requested)\b/i,
}

export function ruleScore(item: Item, now: number, config: RuleConfig = DEFAULT_RULES): number {
  let score = 0
  if (item.labels.includes('priority:high')) score += 3
  if (config.keywords.test(`${item.title} ${item.body}`)) score += 3
  if (config.vipSenders.includes(item.sender)) score += 2
  if (config.actionTitles.test(item.title)) score += 2
  score += Math.round(urgency(item.dueAt, now) * 2)
  return score
}

export function rankByRules(items: readonly Item[], now: number, config: RuleConfig = DEFAULT_RULES): RankedItem[] {
  return items
    .map((item) => ({ item, score: ruleScore(item, now, config) }))
    .sort((a, b) => b.score - a.score || b.item.createdAt - a.item.createdAt)
    .map(({ item, score }) => ({ id: item.id, score, confidence: 1, source: 'rules' }))
}
