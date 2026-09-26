import { describe, expect, it } from 'vitest'
import { embeddingTextFor, findSeed, parseArticles } from './data.ts'

const moon = { id: 19331, title: 'Moon', topic: 'Science', abstract: 'The Moon is Earth’s only natural satellite.', url: 'https://en.wikipedia.org/wiki/Moon' }
const sun = { ...moon, id: 26751, title: 'Sun', abstract: 'The Sun is the star at the centre of the Solar System.', url: 'https://en.wikipedia.org/wiki/Sun' }

describe('parseArticles', () => {
  it('accepts valid articles', () => {
    expect(parseArticles([moon, sun]).map((a) => a.title)).toEqual(['Moon', 'Sun'])
  })

  it('rejects an unknown topic and names the field', () => {
    expect(() => parseArticles([{ ...moon, topic: 'Sports' }])).toThrow(/0\.topic/)
  })

  it('rejects an empty abstract', () => {
    expect(() => parseArticles([{ ...moon, abstract: '' }])).toThrow(/0\.abstract/)
  })

  it('rejects duplicate ids', () => {
    expect(() => parseArticles([moon, { ...sun, id: moon.id }])).toThrow(/duplicate id 19331/)
  })
})

describe('embeddingTextFor', () => {
  it('joins title and abstract', () => {
    expect(embeddingTextFor(parseArticles([moon])[0])).toBe('Moon. The Moon is Earth’s only natural satellite.')
  })
})

describe('findSeed', () => {
  it('finds the seed by title', () => {
    expect(findSeed(parseArticles([moon, sun]), 'Sun').id).toBe(26751)
  })

  it('names the missing seed', () => {
    expect(() => findSeed(parseArticles([sun]), 'Moon')).toThrow('Seed article "Moon" is not in articles.json')
  })
})
