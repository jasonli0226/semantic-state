import { describe, expect, it } from 'vitest'
import { type ExtractResponse, firstSentences, parseVitalList, toArticles } from './wiki.ts'

const WIKITEXT = [
  '== Current total==',
  '* [[Ignored before the list]]',
  '=Level 3 vital articles=',
  '==People==',
  '=== Leaders and politicians ===',
  "* ''Rulers''",
  '* {{Icon|GA}} [[Hammurabi]]',
  '* {{Icon|B}} [[Julius Caesar|Caesar]]',
  '== Science ==',
  '* {{Icon|FA}} [[Moon]]',
  '** {{Icon|B}} [[:Category:Start-Class vital articles|Start]] [[Sun]]',
  '* [[Moon]]',
].join('\n')

describe('parseVitalList', () => {
  it('reads articles under their level-2 topic, from the list heading on', () => {
    expect(parseVitalList(WIKITEXT)).toEqual([
      { title: 'Hammurabi', topic: 'People' },
      { title: 'Julius Caesar', topic: 'People' },
      { title: 'Moon', topic: 'Science' },
      { title: 'Sun', topic: 'Science' },
    ])
  })

  it('throws on a topic heading it does not know', () => {
    expect(() => parseVitalList('=Level 3 vital articles=\n==Sports==\n* [[Chess]]')).toThrow('Unknown topic heading: "Sports"')
  })
})

describe('firstSentences', () => {
  it('keeps the first n sentences and drops empty pronunciation parentheses', () => {
    expect(firstSentences('The Moon ( ) is a satellite.  It orbits Earth. It has phases.', 2)).toBe('The Moon is a satellite. It orbits Earth.')
  })
})

describe('toArticles', () => {
  const entries = [
    { title: 'Moon', topic: 'Science' as const },
    { title: 'Caesar', topic: 'People' as const },
    { title: 'Nowhere', topic: 'Geography' as const },
    { title: 'Luna', topic: 'Science' as const },
  ]
  const response: ExtractResponse = {
    query: {
      redirects: [{ from: 'Caesar', to: 'Julius Caesar' }, { from: 'Luna', to: 'Moon' }],
      pages: [
        { pageid: 1, title: 'Moon', extract: 'The Moon orbits Earth. More text.', fullurl: 'https://en.wikipedia.org/wiki/Moon' },
        { pageid: 2, title: 'Julius Caesar', extract: 'Gaius Julius Caesar was a Roman general.' },
        { title: 'Nowhere', missing: true },
      ],
    },
  }

  it('follows redirects, skips missing pages and duplicates, trims abstracts', () => {
    expect(toArticles(entries, [response], 1)).toEqual([
      { id: 1, title: 'Moon', topic: 'Science', abstract: 'The Moon orbits Earth.', url: 'https://en.wikipedia.org/wiki/Moon' },
      { id: 2, title: 'Julius Caesar', topic: 'People', abstract: 'Gaius Julius Caesar was a Roman general.', url: 'https://en.wikipedia.org/wiki/Julius_Caesar' },
    ])
  })
})
