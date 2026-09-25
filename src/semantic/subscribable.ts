/** Minimal listener set shared by the worker-backed engines. */
export function subscribable<T extends unknown[]>() {
  const listeners = new Set<(...args: T) => void>()
  return {
    add(listener: (...args: T) => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    emit: (...args: T) => listeners.forEach((listener) => listener(...args)),
  }
}
