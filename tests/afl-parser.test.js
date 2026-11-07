// AnimeFillerList HTML parsing against REAL captured pages (see fixture
// provenance headers) plus a malformed-page case.

import test from 'node:test'
import assert from 'node:assert/strict'
import { parseShowPage, parseShowIndex, parseEpisodeRanges } from '../src/providers/animefillerlist.js'
import { fixture } from './helpers.js'

test('parseShowPage: real Naruto page — verified classifications', () => {
  const page = parseShowPage(fixture('afl-naruto.html'))
  assert.equal(page.episodes.size, 220)
  assert.equal(page.minEpisode, 1)
  assert.equal(page.maxEpisode, 220)
  assert.equal(page.showTitle, 'Naruto')
  assert.equal(page.episodes.get(1).type, 'manga-canon') // verified on the live page
  assert.equal(page.episodes.get(7).type, 'mixed')
  assert.equal(page.episodes.get(26).type, 'filler')
  assert.equal(page.episodes.get(220).type, 'mixed')
  assert.equal(page.episodes.get(1).title, 'Enter: Naruto Uzumaki!')
})

test('parseShowPage: real Attack on Titan page — 89 episodes, one page for all seasons', () => {
  const page = parseShowPage(fixture('afl-attack-titan.html'))
  assert.equal(page.episodes.size, 89)
  assert.equal(page.maxEpisode, 89)
  assert.equal(page.showTitle, 'Attack on Titan')
  assert.equal(page.episodes.get(26).type, 'manga-canon') // "Beast Titan" (S2E1 in Stremio)
})

test('parseShowPage: Quick List fallback when the episode table is absent', () => {
  const page = parseShowPage(fixture('afl-naruto-quicklist-only.html'))
  assert.equal(page.episodes.size, 220)
  assert.equal(page.episodes.get(1).type, 'manga-canon')
  assert.equal(page.episodes.get(7).type, 'mixed')
  assert.equal(page.episodes.get(26).type, 'filler')
  assert.equal(page.episodes.get(143).type, 'filler')
  assert.equal(page.episodes.get(220).type, 'mixed')
  // quick-list rows carry no titles
  assert.equal(page.episodes.get(1).title, '')
})

test('parseShowPage: malformed page throws a parse error', () => {
  assert.throws(() => parseShowPage(fixture('afl-malformed.html')), /no episode data/)
})

test('parseShowIndex: real (subset) index incl. the site\'s own slug/title quirk', () => {
  const shows = parseShowIndex(fixture('afl-shows-index.html'))
  const byslug = Object.fromEntries(shows.map((s) => [s.slug, s.title]))
  assert.equal(shows.length, 17)
  assert.equal(byslug.naruto, 'Naruto')
  assert.equal(byslug['attack-titan'], 'Attack on Titan (Shingeki no Kyojin)')
  // This mismatch is verbatim from the real site's index:
  assert.equal(byslug['digimon-frontier'], 'Attack on Titan Films')
})

test('parseEpisodeRanges: numbers, ranges and hostile input', () => {
  assert.deepEqual(parseEpisodeRanges('1-6, 8, 10-13'), [1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 13])
  assert.deepEqual(parseEpisodeRanges('26'), [26])
  assert.deepEqual(parseEpisodeRanges(''), [])
  assert.deepEqual(parseEpisodeRanges('abc, 3-1, 0, 1-99999'), []) // junk and impossible ranges
  // tags are stripped by the caller before parsing quick-list content
  assert.deepEqual(parseEpisodeRanges(' 1-6 , 8 , 10 '), [1, 2, 3, 4, 5, 6, 8, 10])
})
