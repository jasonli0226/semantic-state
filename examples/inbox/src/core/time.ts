export const HOUR = 3_600_000

/** 0..1 — how pressing a deadline is. Overdue and due-within-a-day are equally urgent. */
export function urgency(dueAt: number | null, now: number): number {
  if (dueAt === null) return 0
  const hoursLeft = (dueAt - now) / HOUR
  if (hoursLeft <= 24) return 1
  if (hoursLeft <= 72) return 0.5
  if (hoursLeft <= 168) return 0.2
  return 0
}

/** 0..1 — freshness, halving roughly every 17 hours. */
export function recency(createdAt: number, now: number): number {
  const ageHours = Math.max(0, (now - createdAt) / HOUR)
  return Math.exp(-ageHours / 24)
}
