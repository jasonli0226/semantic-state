import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmbeddingBanner } from './EmbeddingBanner.tsx'

describe('EmbeddingBanner', () => {
  it('shows how many items are embedded while a job runs', () => {
    render(<EmbeddingBanner embedding={{ done: 32, total: 48 }} />)
    expect(screen.getByRole('status').textContent).toContain('Embedding 32 of 48 items')
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('32')
  })

  it('renders nothing when no job runs', () => {
    const { container } = render(<EmbeddingBanner embedding={null} />)
    expect(container.innerHTML).toBe('')
  })
})
