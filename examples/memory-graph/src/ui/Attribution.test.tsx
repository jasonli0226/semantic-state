import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Attribution } from './Attribution.tsx'

describe('Attribution', () => {
  it('links the source and the licence, and says the text was shortened (CC BY-SA 4.0 §3a)', () => {
    render(<Attribution />)
    expect(screen.getByRole('link', { name: 'Wikipedia' }).getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Wikipedia:Vital_articles/Level/3')
    expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' }).getAttribute('href')).toBe('https://creativecommons.org/licenses/by-sa/4.0/')
    expect(screen.queryByText(/shortened to their first sentences/)).not.toBeNull()
  })
})
