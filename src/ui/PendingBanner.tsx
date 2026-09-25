import type { Moves } from '../core/commit.ts'

/** "3 moved up · 1 new" — the ranking changed but the visible order is being held. */
export function PendingBanner({ pending, manual, onCommit }: { pending: Moves; manual: boolean; onCommit: () => void }) {
  if (pending.movedUp + pending.added === 0) return null
  const parts = [pending.movedUp > 0 && `${pending.movedUp} moved up`, pending.added > 0 && `${pending.added} new`].filter(Boolean)
  return (
    <div className="pending" role="status">
      <span>{parts.join(' · ')}</span>
      {manual ? (
        <button type="button" onClick={onCommit}>
          Refresh
        </button>
      ) : (
        <span className="pending-hint">applies when you pause</span>
      )}
    </div>
  )
}
