import { describe, expect, it } from 'vitest'
import { rankByRules, ruleScore } from './rules.ts'
import type { Item } from './types.ts'

const HOUR = 3_600_000
const NOW = 1_000 * HOUR

const item = (over: Partial<Item>): Item => ({
  id: 'x',
  source: 'email',
  sender: 'someone',
  title: 'hello',
  body: '',
  labels: [],
  dueAt: null,
  createdAt: NOW - HOUR,
  ...over,
})

describe('rules', () => {
  it('promotes the "urgent" keyword even on spam (the trap rules fall into)', () => {
    expect(ruleScore(item({ title: 'URGENT!!! act now' }), NOW)).toBeGreaterThan(ruleScore(item({}), NOW))
  })

  it('promotes priority:high labels and VIP senders', () => {
    expect(ruleScore(item({ labels: ['priority:high'] }), NOW)).toBe(3)
    expect(ruleScore(item({ sender: 'Dana (Eng Manager)' }), NOW)).toBe(2)
  })

  it('adds points for close deadlines', () => {
    expect(ruleScore(item({ dueAt: NOW + 5 * HOUR }), NOW)).toBe(2)
    expect(ruleScore(item({ dueAt: NOW + 50 * HOUR }), NOW)).toBe(1)
    expect(ruleScore(item({ dueAt: NOW + 500 * HOUR }), NOW)).toBe(0)
  })

  it('buries an unlabeled bot item regardless of its content', () => {
    const ranked = rankByRules(
      [
        item({ id: 'stripe', sender: 'stripe-bot', title: 'Stripe webhook retries failing in staging' }),
        item({ id: 'allhands', labels: ['priority:high'], title: 'Q3 all-hands reminder' }),
      ],
      NOW,
    )
    expect(ranked.map((r) => r.id)).toEqual(['allhands', 'stripe'])
    expect(ranked[0].source).toBe('rules')
    expect(ranked[0].confidence).toBe(1)
  })

  it('breaks ties by newest first', () => {
    const ranked = rankByRules([item({ id: 'old', createdAt: NOW - 10 * HOUR }), item({ id: 'new', createdAt: NOW })], NOW)
    expect(ranked.map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('boosts failed CI and review requests like a reasonable team would', () => {
    expect(ruleScore(item({ source: 'ci', title: 'CI failed: api main' }), NOW)).toBe(2)
    expect(ruleScore(item({ source: 'github', title: 'Review requested: api #12' }), NOW)).toBe(2)
    expect(ruleScore(item({ source: 'ci', title: 'CI passed: api main' }), NOW)).toBe(0)
  })
})
