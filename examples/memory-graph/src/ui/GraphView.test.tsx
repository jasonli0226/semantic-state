import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Visual } from '../graph/encoding.ts'
import { GraphView } from './GraphView.tsx'

afterEach(cleanup)

const dot: Visual = { radius: 3, tone: 'muted', ring: 0, why: 'Not in the current ranking' }
const titles: Record<number, string> = { 1: 'Moon', 2: 'Tide', 3: 'Sun', 4: 'Lonely' }
const positions = new Map([
  [1, { x: 0, y: 0 }],
  [2, { x: 50, y: 0 }],
  [3, { x: 0, y: 50 }],
  [4, { x: 500, y: 500 }],
])

function renderMap(onActivate = vi.fn()) {
  const view = render(
    <GraphView
      ids={[1, 2, 3, 4]}
      positions={positions}
      edges={[
        { source: 1, target: 2, similarity: 0.8, opacity: 1 },
        { source: 1, target: 3, similarity: 0.6, opacity: 1 },
      ]}
      visuals={new Map([[1, dot], [2, dot], [3, dot], [4, dot]])}
      titleOf={(id) => titles[id]}
      selected={1}
      onActivate={onActivate}
      panelProps={{}}
      animate={false}
      cameraTarget={null}
    />,
  )
  const node = (title: string) => view.container.querySelector<SVGGElement>(`[data-title="${title}"]`)!
  return { ...view, node, onActivate }
}

describe('GraphView (map)', () => {
  it('draws every article and has exactly one tab stop: the selected article', () => {
    const { container } = renderMap()
    expect(container.querySelectorAll('g.node')).toHaveLength(4)
    const stops = [...container.querySelectorAll('g.node[tabindex="0"]')]
    expect(stops.map((n) => n.getAttribute('data-title'))).toEqual(['Moon'])
  })

  it('activates the node that was clicked', () => {
    const { node, onActivate } = renderMap()
    fireEvent.click(node('Sun'))
    expect(onActivate).toHaveBeenCalledWith(3)
  })

  it('arrow keys walk the neighbours of where you started; Escape returns', () => {
    const { node } = renderMap()
    act(() => node('Moon').focus())
    fireEvent.keyDown(node('Moon'), { key: 'ArrowRight' })
    expect(document.activeElement?.getAttribute('data-title')).toBe('Tide')
    fireEvent.keyDown(node('Tide'), { key: 'ArrowRight' })
    expect(document.activeElement?.getAttribute('data-title')).toBe('Sun')
    fireEvent.keyDown(node('Sun'), { key: 'Escape' })
    expect(document.activeElement?.getAttribute('data-title')).toBe('Moon')
  })

  it('arrow keys on a node without neighbours keep focus', () => {
    const { node } = renderMap()
    act(() => node('Lonely').focus())
    fireEvent.keyDown(node('Lonely'), { key: 'ArrowRight' })
    expect(document.activeElement?.getAttribute('data-title')).toBe('Lonely')
  })

  it('labels the focused node even when zoomed out, and highlights its edges', () => {
    const { node, container } = renderMap()
    expect(screen.queryByText('Tide')).toBeNull()
    act(() => node('Tide').focus())
    expect(screen.queryByText('Tide')).not.toBeNull()
    expect(container.querySelector('line.edge.hot')).not.toBeNull()
  })

  it('has zoom buttons', () => {
    renderMap()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fit map' })).toBeTruthy()
  })
})
