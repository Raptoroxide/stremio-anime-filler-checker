// FillerLists bundled dataset: integrity, attribution, lookups.
// The bundle is an adaptation of https://fillerlists.com/data (CC BY-SA 4.0).

import test from 'node:test'
import assert from 'node:assert/strict'
import { createFillerListsProvider } from '../src/providers/fillerlists.js'
import { FILLERLISTS_BUNDLE } from '../src/providers/data/fillerlists-bundle.js'
import { normalizeVerdictKey } from '../src/shared/types.js'

const provider = createFillerListsProvider({ now: () => Date.parse('2026-11-07T00:00:00Z') })

test('bundle: shape and required CC BY-SA 4.0 attribution', () => {
  assert.ok(Array.isArray(FILLERLISTS_BUNDLE.shows))
  assert.equal(FILLERLISTS_BUNDLE.shows.length, 13)
  assert.equal(FILLERLISTS_BUNDLE.source.licence, 'CC BY-SA 4.0')
  assert.equal(FILLERLISTS_BUNDLE.source.licenceUrl, 'https://creativecommons.org/licenses/by-sa/4.0/')
  assert.equal(FILLERLISTS_BUNDLE.source.url, 'https://fillerlists.com/data')
  assert.ok(FILLERLISTS_BUNDLE.source.credit.includes('FillerLists'))
  assert.ok(FILLERLISTS_BUNDLE.datasetUpdated)
})

test('bundle: known show entries with IMDb ids', () => {
  const byslug = Object.fromEntries(FILLERLISTS_BUNDLE.shows.map((s) => [s.slug, s]))
  assert.equal(byslug.naruto.imdbId, 'tt0409591')
  assert.equal(byslug['one-piece'].imdbId, 'tt0388629')
  assert.equal(byslug.naruto.episodeCount, 220)
  assert.equal(byslug['one-piece'].episodeCount, 1180)
})

test('provider: IMDb id match — Naruto episode 26 is filler (FL data)', async () => {
  const r = await provider.lookup({ title: 'Naruto', imdbId: 'tt0409591', year: 2002, season: 1, episode: 26, seasonCounts: null })
  assert.equal(r.status, 'ok')
  assert.equal(r.record.verdict, 'filler')
  assert.equal(r.record.episodeNumber, 26)
  assert.equal(r.record.sourceName, 'FillerLists')
  assert.equal(r.record.sourceUrl, 'https://fillerlists.com/naruto')
  assert.equal(r.record.sourceUpdatedAt, '2026-11-03')
  assert.equal(r.record.fromCache, false)
})

test('provider: title match — One Piece episode 1 is manga canon', async () => {
  const r = await provider.lookup({ title: 'One Piece', imdbId: null, year: 1999, season: 1, episode: 1, seasonCounts: null })
  assert.equal(r.status, 'ok')
  assert.equal(r.record.verdict, 'manga-canon')
  assert.equal(r.record.sourceName, 'FillerLists')
})

test('provider: multi-season mapping with Cinemeta counts (One Piece S10E31 → 226, filler)', async () => {
  const counts = new Map([[1, 8], [2, 22], [3, 17], [4, 13], [5, 9], [6, 22], [7, 39], [8, 13], [9, 52], [10, 31]])
  const r = await provider.lookup({ title: 'One Piece', imdbId: 'tt0388629', year: 1999, season: 10, episode: 31, seasonCounts: counts })
  assert.equal(r.status, 'ok')
  assert.equal(r.record.episodeNumber, 226)
  assert.equal(r.record.verdict, 'filler')
})

test('provider: episode not covered by the dataset', async () => {
  const r = await provider.lookup({ title: 'One Piece', imdbId: 'tt0388629', season: 1, episode: 1181, seasonCounts: null })
  assert.equal(r.status, 'ok')
  assert.equal(r.record.verdict, 'unknown')
  assert.equal(r.record.reason, 'not-listed')
})

test('provider: specials stay UNKNOWN', async () => {
  const r = await provider.lookup({ title: 'Naruto', imdbId: 'tt0409591', season: 0, episode: 1, seasonCounts: null })
  assert.equal(r.status, 'ok')
  assert.equal(r.record.verdict, 'unknown')
  assert.equal(r.record.reason, 'special')
})

test('provider: shows outside the 13-show dataset do not match', async () => {
  const r = await provider.lookup({ title: 'Attack on Titan', imdbId: 'tt2560140', year: 2013, season: 1, episode: 1, seasonCounts: null })
  assert.equal(r.status, 'no-match')
})

test('normalizeVerdictKey maps all FillerLists codes and AFL labels', () => {
  assert.equal(normalizeVerdictKey('canon'), 'manga-canon')
  assert.equal(normalizeVerdictKey('anime-canon'), 'anime-canon')
  assert.equal(normalizeVerdictKey('mixed'), 'mixed')
  assert.equal(normalizeVerdictKey('filler'), 'filler')
  assert.equal(normalizeVerdictKey('unknown'), 'unknown')
  assert.equal(normalizeVerdictKey('u'), 'unknown')
  assert.equal(normalizeVerdictKey('manga_canon'), 'manga-canon')
  assert.equal(normalizeVerdictKey('mixed_canon/filler'), 'mixed')
  assert.equal(normalizeVerdictKey('Anime Canon'), 'anime-canon')
  assert.equal(normalizeVerdictKey('Mixed Canon/Filler'), 'mixed')
  assert.equal(normalizeVerdictKey('nonsense'), 'unknown') // never defaults to canon
  assert.equal(normalizeVerdictKey(null), 'unknown')
})
