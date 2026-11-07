// Season/episode → absolute episode mapping, using REAL Cinemeta fixture
// data (Naruto: seasons {0:7, 1:35, 2:48, 3:48, 4:48, 5:41}, 220 regular
// episodes — exactly matching AnimeFillerList's 220-episode page).

import test from 'node:test'
import assert from 'node:assert/strict'
import { computeSeasonCounts, mapToAbsolute } from '../src/matching/episodes.js'
import { fixtureJson } from './helpers.js'

function narutoCounts () {
  const meta = fixtureJson('cinemeta-tt0409591.json').meta
  return computeSeasonCounts(meta.videos)
}

test('computeSeasonCounts: real Naruto fixture', () => {
  const { counts, totalRegular, maxSeason } = narutoCounts()
  assert.equal(counts.get(0), 7) // specials
  assert.equal(counts.get(1), 35)
  assert.equal(counts.get(2), 48)
  assert.equal(counts.get(3), 48)
  assert.equal(counts.get(4), 48)
  assert.equal(counts.get(5), 41)
  assert.equal(totalRegular, 220)
  assert.equal(maxSeason, 5)
})

test('computeSeasonCounts: hostile input', () => {
  assert.deepEqual(computeSeasonCounts(null), { counts: new Map(), totalRegular: 0, maxSeason: 0 })
  assert.deepEqual(computeSeasonCounts([null, {}, { season: 'x', number: 'y' }]).totalRegular, 0)
})

test('mapToAbsolute: season 1 maps directly (Episode 26 stays 26)', () => {
  const { counts } = narutoCounts()
  const r = mapToAbsolute({ season: 1, episode: 26, seasonCounts: counts, sourceTotal: 220 })
  assert.deepEqual(r, { absolute: 26, confidence: 'high' })
})

test('mapToAbsolute: multi-season cumulative mapping (Naruto S5E41 → 220)', () => {
  const { counts } = narutoCounts()
  const r = mapToAbsolute({ season: 5, episode: 41, seasonCounts: counts, sourceTotal: 220 })
  assert.equal(r.absolute, 220)
  assert.equal(r.confidence, 'high')
  assert.equal(mapToAbsolute({ season: 3, episode: 10, seasonCounts: counts, sourceTotal: 220 }).absolute, 93)
  assert.equal(mapToAbsolute({ season: 2, episode: 1, seasonCounts: counts, sourceTotal: 220 }).absolute, 36)
})

test('mapToAbsolute: specials (season 0) are never folded into numbering', () => {
  const { counts } = narutoCounts()
  assert.deepEqual(
    mapToAbsolute({ season: 0, episode: 3, seasonCounts: counts, sourceTotal: 220 }),
    { error: 'special' }
  )
})

test('mapToAbsolute: episode beyond the source total is not-listed, not guessed', () => {
  const { counts } = narutoCounts()
  const r = mapToAbsolute({ season: 1, episode: 221, seasonCounts: counts, sourceTotal: 220 })
  assert.equal(r.error, 'not-listed')
  assert.equal(r.absolute, 221)
})

test('mapToAbsolute: season totals mismatch lowers confidence but stays honest', () => {
  const { counts } = narutoCounts()
  // One Piece-style situation: Cinemeta counts 1179 regular episodes while
  // the source page lists fewer/more — the mapping is still derived from the
  // metadata and flagged as approximate rather than refused.
  const r = mapToAbsolute({ season: 5, episode: 41, seasonCounts: counts, sourceTotal: 230 })
  assert.equal(r.absolute, 220)
  assert.equal(r.confidence, 'medium')
})

test('mapToAbsolute: no season metadata — only season 1 is mappable', () => {
  assert.deepEqual(
    mapToAbsolute({ season: 1, episode: 5, seasonCounts: null, sourceTotal: 220 }),
    { absolute: 5, confidence: 'medium' }
  )
  assert.equal(mapToAbsolute({ season: 2, episode: 5, seasonCounts: null, sourceTotal: 220 }).error, 'no-mapping')
})

test('mapToAbsolute: unknown season and invalid values are rejected', () => {
  const { counts } = narutoCounts()
  assert.equal(mapToAbsolute({ season: 6, episode: 1, seasonCounts: counts, sourceTotal: 220 }).error, 'season-unknown')
  assert.equal(mapToAbsolute({ season: -1, episode: 1, seasonCounts: counts, sourceTotal: 220 }).error, 'no-mapping')
  assert.equal(mapToAbsolute({ season: 1, episode: 0, seasonCounts: counts, sourceTotal: 220 }).error, 'no-mapping')
  assert.equal(mapToAbsolute({ season: 999, episode: 1, seasonCounts: counts, sourceTotal: 220 }).error, 'no-mapping')
})

test('mapToAbsolute: NO invented offsets — sequels with their own entries start at 1', () => {
  // Naruto Shippuden is a separate series entry with its own absolute
  // numbering; S1E1 must map to 1, never to 221.
  const shippudenCounts = new Map([[1, 32], [2, 21], [3, 18]])
  const r = mapToAbsolute({ season: 1, episode: 1, seasonCounts: shippudenCounts, sourceTotal: 500 })
  assert.equal(r.absolute, 1)
  assert.equal(r.confidence, 'medium') // partial counts → not claimed as exact
})

test('mapToAbsolute: season-specific page with restarting numbering', () => {
  const counts = new Map([[1, 25], [2, 12]])
  const r = mapToAbsolute({ season: 2, episode: 5, seasonCounts: counts, sourceTotal: 12, seasonPage: true, pageMinEpisode: 1 })
  assert.equal(r.absolute, 5) // page numbers restart; no offset applied
})
