import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Visual } from '../graph/encoding.ts'
import { GraphView } from './GraphView.tsx'

const small: Visual = { radius: 8, tone: 'muted', ring: 0, why: 'Not in the current ranking' }
const titles: Record<number, string> = { 1: 'Moon', 2: 'Tide' }

function renderGraph() {
  return render(
    <GraphView
      nodes={[{ id: 1, parent: null }, { id: 2, parent: 1 }]}
      edges={[{ source: 1, target: 2, similarity: 0.6 }]}
      visuals={new Map([[1, small], [2, small]])}
      titleOf={(id) => titles[id]}
      selected={null}
      onActivate={() => {}}
      panelProps={{}}
      animate={false}
    />,
  )
}

describe('GraphView', () => {
  it('labels a focused node and highlights its edges, like hover', () => {
    const { container } = renderGraph()
    expect(screen.queryByText('Tide')).toBeNull()
    act(() => screen.getByRole('button', { name: /^Tide\./ }).focus())
    expect(screen.queryByText('Tide')).not.toBeNull()
    expect(container.querySelector('line.edge.hot')).not.toBeNull()
  })
})
