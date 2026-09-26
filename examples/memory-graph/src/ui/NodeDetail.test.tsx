import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Article } from '../types.ts'
import { NodeDetail } from './NodeDetail.tsx'

afterEach(cleanup)

const moon: Article = { id: 1, title: 'Moon', topic: 'Science', abstract: 'A satellite.', url: 'https://en.wikipedia.org/wiki/Moon' }

describe('NodeDetail', () => {
  it('lists the nearest articles as buttons that explore them', () => {
    const onActivate = vi.fn()
    render(
      <NodeDetail
        article={moon}
        visual={undefined}
        neighbours={[
          { id: 3, title: 'Earth', similarity: 0.61 },
          { id: 4, title: 'Tide', similarity: 0.55 },
        ]}
        onActivate={onActivate}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Earth/ }))
    expect(onActivate).toHaveBeenCalledWith(3)
    expect(screen.getByRole('button', { name: /^Tide/ }).textContent).toContain('0.55')
  })

  it('says when neighbours are still loading', () => {
    render(<NodeDetail article={moon} visual={undefined} neighbours={[]} onActivate={() => {}} />)
    expect(screen.queryByText('Finding nearest articles…')).not.toBeNull()
  })
})
