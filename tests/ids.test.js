// Video id parsing and explicit episode tokens.

import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVideoId, parseEpisodeToken, parseSeasonEpisodeParams } from '../src/shared/ids.js'

test('parseVideoId: Cinemeta video id tt...:season:episode', () => {
  assert.deepEqual(
    parseVideoId('tt3107288:1:1'),
    { family: 'imdb', seriesId: 'tt3107288', season: 1, episode: 1 }
  )
  assert.deepEqual(
    parseVideoId('tt0409591:5:41'),
    { family: 'imdb', seriesId: 'tt0409591', season: 5, episode: 41 }
  )
})

test('parseVideoId: trailing .json is stripped', () => {
  assert.deepEqual(
    parseVideoId('tt0409591:1:26.json'),
    { family: 'imdb', seriesId: 'tt0409591', season: 1, episode: 26 }
  )
})

test('parseVideoId: URL-encoded colons are decoded safely', () => {
  assert.deepEqual(
    parseVideoId('tt0409591%3A1%3A26.json'),
    { family: 'imdb', seriesId: 'tt0409591', season: 1, episode: 26 }
  )
})

test('parseVideoId: bare series id (no season/episode)', () => {
  assert.deepEqual(
    parseVideoId('tt0409591'),
    { family: 'imdb', seriesId: 'tt0409591', season: null, episode: null }
  )
  assert.deepEqual(
    parseVideoId('tt0409591.json'),
    { family: 'imdb', seriesId: 'tt0409591', season: null, episode: null }
  )
})

test('parseVideoId: kitsu family', () => {
  assert.deepEqual(
    parseVideoId('kitsu:12:1:2'),
    { family: 'kitsu', seriesId: 'kitsu:12', season: 1, episode: 2 }
  )
  assert.deepEqual(
    parseVideoId('kitsu:12'),
    { family: 'kitsu', seriesId: 'kitsu:12', season: null, episode: null }
  )
})

test('parseVideoId: specials keep season 0', () => {
  const parsed = parseVideoId('tt0409591:0:3')
  assert.equal(parsed.season, 0)
  assert.equal(parsed.episode, 3)
})

test('parseVideoId: invalid and ambiguous ids are rejected safely', () => {
  assert.equal(parseVideoId(''), null)
  assert.equal(parseVideoId(null), null)
  assert.equal(parseVideoId('x'.repeat(200)), null) // too long
  // incomplete Cinemeta forms do NOT become video ids (season/episode null):
  const partial = parseVideoId('tt0409591:1')
  assert.equal(partial.family, 'unknown')
  assert.equal(partial.season, null)
  const trailing = parseVideoId('tt0409591:1:')
  assert.equal(trailing.family, 'unknown')
  const zero = parseVideoId('tt0409591:1:0') // episode 0 is not a real episode
  assert.equal(zero.family, 'imdb')
  assert.equal(zero.episode, null)
  assert.equal(parseVideoId('tt:1:2').family, 'unknown') // "tt" without digits
  // Unknown families are flagged, never guessed:
  const unknown = parseVideoId('anilist:12345:1:2')
  assert.equal(unknown.family, 'unknown')
  assert.equal(unknown.season, null)
  const unknown2 = parseVideoId('foo123:1:2')
  assert.equal(unknown2.family, 'unknown')
})

test('parseEpisodeToken: S01E02 / 1x02 / season:episode forms', () => {
  assert.deepEqual(parseEpisodeToken('S01E02'), { season: 1, episode: 2 })
  assert.deepEqual(parseEpisodeToken('s1e2'), { season: 1, episode: 2 })
  assert.deepEqual(parseEpisodeToken('1x02'), { season: 1, episode: 2 })
  assert.deepEqual(parseEpisodeToken('12x345'), { season: 12, episode: 345 })
  assert.deepEqual(parseEpisodeToken('1:2'), { season: 1, episode: 2 })
  assert.equal(parseEpisodeToken('S1E'), null)
  assert.equal(parseEpisodeToken('abc'), null)
  assert.equal(parseEpisodeToken('S999999E2'), null)
  assert.equal(parseEpisodeToken(''), null)
})

test('parseSeasonEpisodeParams: season=1&episode=2 style and ep tokens', () => {
  assert.deepEqual(parseSeasonEpisodeParams({ season: '1', episode: '2' }), { season: 1, episode: 2 })
  assert.deepEqual(parseSeasonEpisodeParams({ s: '3', e: '4' }), { season: 3, episode: 4 })
  assert.deepEqual(parseSeasonEpisodeParams({ ep: 'S02E05' }), { season: 2, episode: 5 })
  assert.deepEqual(parseSeasonEpisodeParams({ ep: '2x05', season: '9', episode: '9' }), { season: 2, episode: 5 })
  assert.equal(parseSeasonEpisodeParams({ season: '1' }), null)
  assert.equal(parseSeasonEpisodeParams({}), null)
  assert.equal(parseSeasonEpisodeParams({ season: '1', episode: '0' }), null)
  assert.equal(parseSeasonEpisodeParams({ season: '-1', episode: '2' }), null)
})
