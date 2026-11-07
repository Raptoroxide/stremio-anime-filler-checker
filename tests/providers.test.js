// Provider behaviour: AFL happy path, quirk guard, outage fallback, stale
// cache, negative caching, and the priority pipeline.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHttp } from '../src/shared/http.js'
import { TTLCache } from '../src/cache/memory.js'
import { createAnimeFillerListProvider } from '../src/providers/animefillerlist.js'
import { createProviders } from '../src/providers/index.js'
import { parseShowIndex } from '../src/providers/animefillerlist.js'
import { fixture, fixtureJson, stubFetch, TEST_POLICIES, scope } from './helpers.js'

const SEED = { shows: parseShowIndex(fixture('afl-shows-index.html')), retrievedAt: '2026-11-07' }

function narutoArgs (over = {}) {
  const meta = fixtureJson('cinemeta-tt0409591.json').meta
  const counts = new Map()
  for (const v of meta.videos) {
    if (v.season >= 0) counts.set(v.season, Math.max(counts.get(v.season) || 0, v.number))
  }
  return {
    title: 'Naruto',
    aliases: [],
    year: 2002,
    season: 1,
    episode: 26,
    seasonCounts: counts,
    imdbId: 'tt0409591',
    ...over
  }
}

function makeProvider (routes, { now = () => NOW, cache = new TTLCache() } = {}) {
  const http = createHttp({ fetchImpl: stubFetch(routes), policies: TEST_POLICIES })
  const provider = createAnimeFillerListProvider({ http, now, cache, inflight: new Map(), seed: SEED })
  return { provider, cache }
}

let NOW = Date.parse('2026-11-07T00:00:00Z')

test('AFL provider: verified filler lookup with real fixture page', async () => {
  const { provider } = makeProvider([
    { url: 'https://www.animefillerlist.com/shows/naruto', body: fixture('afl-naruto.html') },
    { url: 'https://www.animefillerlist.com/shows', body: fixture('afl-shows-index.html') }
  ])
  const r = await provider.lookup(narutoArgs(), scope())
  assert.equal(r.status, 'ok')
  assert.equal(r.record.verdict, 'filler')
  assert.equal(r.record.episodeNumber, 26)
  assert.equal(r.record.episodeTitle, 'Special Report: Live from the Forest of Death!')
  assert.equal(r.record.sourceName, 'AnimeFillerList')
  assert.equal(r.record.sourceUrl, 'https://www.animefillerlist.com/shows/naruto')
  assert.equal(r.record.mappingConfidence, 'high')
  assert.ok(r.record.checkedAt)
})

test('AFL provider: multi-season request maps through Cinemeta counts (S5E41 → 220, mixed)', async () => {
  const { provider } = makeProvider([
    { url: 'https://www.animefillerlist.com/shows/naruto', body: fixture('afl-naruto.html') }
  ])
  const r = await provider.lookup(narutoArgs({ season: 5, episode: 41 }), scope())
  assert.equal(r.status, 'ok')
  assert.equal(r.record.episodeNumber, 220)
  assert.equal(r.record.verdict, 'mixed')
})

test('AFL provider: season 0 (specials) returns an explicit UNKNOWN record', async () => {
  const { provider } = makeProvider([
    { url: 'https://www.animefillerlist.com/shows/naruto', body: fixture('afl-naruto.html') }
  ])
  const r = await provider.lookup(narutoArgs({ season: 0, episode: 2 }), scope())
  assert.equal(r.status, 'ok')
  assert.equal(r.record.verdict, 'unknown')
  assert.equal(r.record.reason, 'special')
})

test('AFL provider: H1 cross-check rejects the site\'s own slug/title quirk', async () => {
  // The real index links "Attack on Titan Films" to /shows/digimon-frontier.
  // Fetching that slug returns a different show's page; the provider must
  // refuse the match instead of returning wrong data.
  const { provider } = makeProvider([
    { url: 'https://www.animefillerlist.com/shows/digimon-frontier', body: fixture('afl-naruto.html') }
  ])
  const r = await provider.lookup({ title: 'Attack on Titan Films', year: null, season: 1, episode: 1, seasonCounts: null, imdbId: null }, scope())
  assert.equal(r.status, 'no-match')
})

test('AFL provider: unknown show consults the live index, then reports no-match', async () => {
  const fetchImpl = stubFetch([
    { url: 'https://www.animefillerlist.com/shows', body: fixture('afl-shows-index.html') }
  ])
  const http = createHttp({ fetchImpl, policies: TEST_POLICIES })
  const provider = createAnimeFillerListProvider({ http, now: () => NOW, cache: new TTLCache(), inflight: new Map(), seed: SEED })
  const r = await provider.lookup({ title: 'Totally Unknown Anime', year: 2020, season: 1, episode: 1, seasonCounts: null, imdbId: null }, scope())
  assert.equal(r.status, 'no-match')
  assert.equal(fetchImpl.calls.length, 1) // exactly one index fetch — nothing else
})

test('AFL provider: upstream failure reports error, and is negative-cached briefly', async () => {
  const fetchImpl = stubFetch([], { defaultThrow: 'network down' })
  const http = createHttp({ fetchImpl, policies: TEST_POLICIES })
  const cache = new TTLCache()
  const provider = createAnimeFillerListProvider({ http, now: () => NOW, cache, inflight: new Map(), seed: SEED })
  const r1 = await provider.lookup(narutoArgs(), scope())
  assert.equal(r1.status, 'error')
  const callsAfterFirst = fetchImpl.calls.length
  // second lookup must not refetch within the negative TTL
  const r2 = await provider.lookup(narutoArgs(), scope())
  assert.equal(r2.status, 'error')
  assert.equal(fetchImpl.calls.length, callsAfterFirst)
})

test('AFL provider: stale cached data is served and flagged when the source is down', async () => {
  let clock = Date.parse('2026-11-07T00:00:00Z')
  const now = () => clock
  const cache = new TTLCache()

  // 1. successful fetch caches the page for 24h
  const okHttp = createHttp({ fetchImpl: stubFetch([
    { url: 'https://www.animefillerlist.com/shows/naruto', body: fixture('afl-naruto.html') }
  ]), policies: TEST_POLICIES })
  const p1 = createAnimeFillerListProvider({ http: okHttp, now, cache, inflight: new Map(), seed: SEED })
  const r1 = await p1.lookup(narutoArgs(), scope())
  assert.equal(r1.status, 'ok')
  assert.equal(r1.record.fromCache, false)

  // 2. time passes beyond the TTL; the source now fails
  clock += 25 * 60 * 60 * 1000
  const failHttp = createHttp({ fetchImpl: stubFetch([], { defaultThrow: 'outage' }), policies: TEST_POLICIES })
  const p2 = createAnimeFillerListProvider({ http: failHttp, now, cache, inflight: new Map(), seed: SEED })
  const r2 = await p2.lookup(narutoArgs(), scope())
  assert.equal(r2.status, 'ok')
  assert.equal(r2.record.verdict, 'filler')
  assert.equal(r2.record.fromCache, true) // served from the stale cache, flagged
})

test('AFL provider: malformed page reports error (parser failure fails gracefully)', async () => {
  const { provider } = makeProvider([
    { url: 'https://www.animefillerlist.com/shows/naruto', body: fixture('afl-malformed.html') }
  ])
  const r = await provider.lookup(narutoArgs(), scope())
  assert.equal(r.status, 'error')
})

test('priority pipeline: AnimeFillerList wins when healthy', async () => {
  const http = createHttp({ fetchImpl: stubFetch([
    { url: 'https://www.animefillerlist.com/shows/naruto', body: fixture('afl-naruto.html') }
  ]), policies: TEST_POLICIES })
  const providers = createProviders({ http, now: () => NOW, cache: new TTLCache() })
  const r = await providers.lookup(narutoArgs(), scope())
  assert.equal(r.provider, 'AnimeFillerList')
  assert.equal(r.record.verdict, 'filler')
})

test('priority pipeline: FillerLists fallback when AnimeFillerList fails', async () => {
  const http = createHttp({ fetchImpl: stubFetch([], { defaultThrow: 'afl outage' }), policies: TEST_POLICIES })
  const providers = createProviders({ http, now: () => NOW, cache: new TTLCache() })
  const r = await providers.lookup(narutoArgs(), scope())
  assert.equal(r.provider, 'FillerLists')
  assert.equal(r.record.verdict, 'filler')
  assert.ok(r.errors.length >= 1)
  assert.ok(r.errors[0].includes('AnimeFillerList'))
})

test('priority pipeline: AFL no-match falls through to FillerLists by title', async () => {
  // Black Clover is not in the fixture seed/index, so AFL reports no-match;
  // FillerLists covers it.
  const fetchImpl = stubFetch([
    { url: 'https://www.animefillerlist.com/shows', body: fixture('afl-shows-index.html') }
  ])
  const http = createHttp({ fetchImpl, policies: TEST_POLICIES })
  const providers = createProviders({ http, now: () => NOW, cache: new TTLCache() })
  const r = await providers.lookup({ title: 'Black Clover', year: 2017, season: 1, episode: 1, seasonCounts: null, imdbId: null }, scope())
  assert.equal(r.provider, 'FillerLists')
  assert.equal(r.record.verdict, 'manga-canon')
})

test('priority pipeline: no provider has data → null record', async () => {
  const http = createHttp({ fetchImpl: stubFetch([
    { url: 'https://www.animefillerlist.com/shows', body: fixture('afl-shows-index.html') }
  ]), policies: TEST_POLICIES })
  const providers = createProviders({ http, now: () => NOW, cache: new TTLCache() })
  const r = await providers.lookup({ title: 'Nobody Knows This Show', year: 2020, season: 1, episode: 1, seasonCounts: null, imdbId: null }, scope())
  assert.equal(r.record, null)
  assert.equal(r.provider, null)
  assert.deepEqual(r.errors, [])
})
