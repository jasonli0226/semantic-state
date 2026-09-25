import { useEffect, useState } from 'react'

export interface LongTasks {
  readonly count: number
  readonly maxMs: number
  readonly supported: boolean
}

/** Main-thread tasks over 50ms (Chromium only). Anything here is jank the user can feel. */
export function useLongTasks(): LongTasks {
  const supported = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')
  const [tasks, setTasks] = useState<LongTasks>({ count: 0, maxMs: 0, supported: Boolean(supported) })

  useEffect(() => {
    if (!supported) return
    const observer = new PerformanceObserver((list) => {
      const durations = list.getEntries().map((entry) => entry.duration)
      setTasks((prev) => ({ ...prev, count: prev.count + durations.length, maxMs: Math.max(prev.maxMs, ...durations) }))
    })
    observer.observe({ type: 'longtask' })
    return () => observer.disconnect()
  }, [supported])

  return tasks
}
