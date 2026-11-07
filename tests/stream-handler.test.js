// End-to-end app tests through createApp() with stubbed upstreams: manifest,
// stream responses (Stremio protocol shapes), pages, CORS, subtitles badge,
// fallbacks and input hardening.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/server.js'
import { mockReq, mockRes, jsonOf, stubFetch, TEST_POLICIES, standardRoutes, fixture } from './helpers.js'

const HEADERS = { host: 'demo.example', 'x-forwarded-proto': 'https' }

function makeApp ({ routes = standardRoutes(), env = {} } = {}) {
  const fetchImpl = stubFetch(routes)
  const { handle } = createApp({ env, fetchImpl, httpPolicies: TEST_POLICIES })
  const get = async (url, method = 'GET', headers = HEADERS) => {
    const res = mockRes()
    await handle(mockReq(method, url, headers), res)
    return res
  }
  return { get, fetchImpl }
}

test('GET /manifest.json — valid Stremio manifest with CORS', async () => {
  const { get } = makeApp()
  const res = await get('/manifest.json')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['access-control-allow-origin'], '*')
  assert.ok(res.headers['content-type'].includes('application/json'))
  const manifest = jsonOf(res)
  assert.equal(manifest.id, 'org.raptoroxide.animefillerchecker')
  assert.equal(manifest.version, '1.0.0')
  assert.equal(manifest.name, 'Anime Filler Checker')
  assert.ok(Array.isArray(manifest.resources))
  assert.equal(manifest.resources[0], 'stream')
  assert.ok(manifest.types.includes('series'))
  assert.deepEqual(manifest.catalogs, [])
  assert.equal('idPrefixes' in manifest, false) // receives all id families
  assert.ok(res.headers['cache-control'].includes('max-age'))
})

test('manifest is also served at /api/manifest.json (Vercel rewrite destination form)', async () => {
  const { get } = makeApp()
  const res = await get('/api/manifest.json')
  assert.equal(res.statusCode, 200)
  assert.equal(jsonOf(res).id, 'org.raptoroxide.animefillerchecker')
})

test('OPTIONS preflight returns 204 with CORS headers', async () => {
  const { get } = makeApp()
  const res = await get('/manifest.json', 'OPTIONS')
  assert.equal(res.statusCode, 204)
  assert.equal(res.headers['access-control-allow-origin'], '*')
  assert.equal(res.headers['access-control-allow-methods'], 'GET, HEAD, OPTIONS')
})

test('non-GET methods are rejected with 405', async () => {
  const { get } = makeApp()
  const res = await get('/manifest.json', 'POST')
  assert.equal(res.statusCode, 405)
})

test('GET /health — JSON health payload', async () => {
  const { get } = makeApp()
  const res = await get('/health')
  assert.equal(res.statusCode, 200)
  const j = jsonOf(res)
  assert.equal(j.status, 'ok')
  assert.equal(j.version, '1.0.0')
  assert.equal(j.subtitlesBadgeEnabled, false)
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('GET / — landing page with install link and manifest URL', async () => {
  const { get } = makeApp()
  const res = await get('/')
  assert.equal(res.statusCode, 200)
  assert.ok(res.headers['content-type'].includes('text/html'))
  assert.ok(res.body.includes('stremio://demo.example/manifest.json'))
  assert.ok(res.body.includes('https://demo.example/manifest.json'))
  assert.ok(res.body.includes('Install in Stremio'))
})

test('Naruto S1E26 — known FILLER row (verified fixture data)', async () => {
  const { get } = makeApp()
  const res = await get('/stream/series/tt0409591:1:26.json')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['access-control-allow-origin'], '*')
  const j = jsonOf(res)
  assert.equal(j.streams.length, 1)
  const row = j.streams[0]
  assert.equal(row.name, 'ANIME FILLER CHECK')
  assert.equal(row.description, 'FILLER · Naruto · Episode 26 · Source: AnimeFillerList')
  assert.ok(row.externalUrl.startsWith('https://demo.example/check?'))
  // informational only — no playable-source fields whatsoever:
  assert.equal('url' in row, false)
  assert.equal('infoHash' in row, false)
  assert.equal('ytId' in row, false)
  assert.equal('fileIdx' in row, false)
  assert.ok(res.headers['cache-control'].includes('max-age=600'))
})

test('Naruto S1E1 — known MANGA CANON row', async () => {
  const { get } = makeApp()
  const res = await get('/stream/series/tt0409591:1:1.json')
  const row = jsonOf(res).streams[0]
  assert.ok(row.description.startsWith('MANGA CANON · Naruto · Episode 1 ·'))
})

test('Naruto S1E7 — known MIXED CANON/FILLER row', async () => {
  const { get } = makeApp()
  const res = await get('/stream/series/tt0409591:1:7.json')
  const row = jsonOf(res).streams[0]
  assert.ok(row.description.startsWith('MIXED CANON/FILLER · Naruto · Episode 7 ·'))
})

test('Naruto S5E41 — multi-season mapping to Episode 220', async () => {
  const { get } = makeApp()
  const res = await get('/stream/series/tt0409591:5:41.json')
  const row = jsonOf(res).streams[0]
  assert.ok(row.description.includes('S5E41 → Episode 220'))
  assert.ok(row.description.startsWith('MIXED CANON/FILLER'))
})

test('Attack on Titan S2E1 — maps to Episode 26 (MANGA CANON)', async () => {
  const { get } = makeApp()
  const res = await get('/stream/series/tt2560140:2:1.json')
  const row = jsonOf(res).streams[0]
  assert.ok(row.description.includes('Episode 26'))
  assert.ok(row.description.startsWith('MANGA CANON'))
})

test('Attack on Titan S0E1 (special) — UNKNOWN row with the specials reason', async () => {
  const { get } = makeApp()
  const res = await get('/stream/series/tt2560140:0:1.json')
  const row = jsonOf(res).streams[0]
  assert.ok(row.description.startsWith('UNKNOWN · Attack on Titan · Special S0E1 ·'))
  assert.ok(row.description.includes('specials and OVAs'))
})

test('anime with no source data — UNKNOWN row, never a guess', async () => {
  const { get } = makeApp()
  const res = await get('/stream/series/tt9990001:1:1.json')
  const j = jsonOf(res)
  assert.equal(j.streams.length, 1)
  assert.ok(j.streams[0].description.startsWith('UNKNOWN · Test Anime Chronicles · S1E1 ·'))
  assert.ok(j.streams[0].description.includes('no reliable episode data found'))
})

test('non-anime series — empty valid response, no misleading UNKNOWN row', async () => {
  const { get } = makeApp()
  const res = await get('/stream/series/tt2861424:1:1.json') // Rick and Morty
  assert.equal(res.statusCode, 200)
  assert.deepEqual(jsonOf(res), { streams: [] })
})

test('unresolvable and malformed ids — empty valid responses', async () => {
  const { get } = makeApp()
  for (const id of ['foo123:1:2', 'tt0409591', 'tt0409591:1', 'tt0409591:1:0', 'x'.repeat(300)]) {
    const res = await get(`/stream/series/${id}.json`)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(jsonOf(res), { streams: [] }, `failed for ${id}`)
  }
})

test('movie type requests get an empty valid response', async () => {
  const { get } = makeApp()
  const res = await get('/stream/movie/tt0409591:1:1.json')
  assert.deepEqual(jsonOf(res), { streams: [] })
})

test('URL-encoded colons in the id are handled', async () => {
  const { get } = makeApp()
  const res = await get('/stream/series/tt0409591%3A1%3A26.json')
  const row = jsonOf(res).streams[0]
  assert.ok(row.description.startsWith('FILLER · Naruto · Episode 26'))
})

test('protocol extra path arguments are tolerated', async () => {
  const { get } = makeApp()
  const res = await get('/stream/series/tt0409591:1:26/search=foo%26bar.json')
  const row = jsonOf(res).streams[0]
  assert.ok(row.description.startsWith('FILLER · Naruto · Episode 26'))
})

test('AnimeFillerList outage — FillerLists fallback still answers (Naruto via IMDb id)', async () => {
  const { get, fetchImpl } = makeApp({
    routes: [
      { url: 'https://v3-cinemeta.strem.io/meta/series/tt0409591.json', body: fixture('cinemeta-tt0409591.json') },
      { url: 'https://www.animefillerlist.com/shows/naruto', throw: 'afl outage' }
    ]
  })
  const res = await get('/stream/series/tt0409591:1:26.json')
  const row = jsonOf(res).streams[0]
  assert.ok(row.description.includes('Source: FillerLists'))
  assert.ok(row.description.startsWith('FILLER'))
  assert.ok(fetchImpl.calls.some((c) => c.url.includes('animefillerlist.com')))
})

test('Cinemeta outage — empty valid response, no 5xx', async () => {
  const { get } = makeApp({
    routes: [{ url: 'https://v3-cinemeta.strem.io/meta/series/tt0409591.json', throw: 'cinemeta down' }]
  })
  const res = await get('/stream/series/tt0409591:1:26.json')
  assert.equal(res.statusCode, 200)
  assert.deepEqual(jsonOf(res), { streams: [] })
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('Kitsu id family resolves and answers (via FillerLists fallback)', async () => {
  const { get } = makeApp()
  const res = await get('/stream/series/kitsu:12:1:50.json')
  const row = jsonOf(res).streams[0]
  assert.ok(row.description.startsWith('FILLER · One Piece · Episode 50'))
})

test('GET /check?id=…&s=…&e=… — details page with verdict and source', async () => {
  const { get } = makeApp()
  const res = await get('/check?id=tt0409591&s=1&e=26')
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('badge-verdict verdict-filler'))
  assert.ok(res.body.includes('FILLER'))
  assert.ok(res.body.includes('AnimeFillerList'))
  assert.ok(res.body.includes('https://www.animefillerlist.com/shows/naruto'))
  assert.ok(res.body.includes('MIXED CANON/FILLER')) // verdict legend present
})

test('GET /check without params — help page', async () => {
  const { get } = makeApp()
  const res = await get('/check')
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('Help'))
  assert.ok(res.body.includes('Manual lookup'))
})

test('GET /check — hostile title is HTML-escaped (no injection)', async () => {
  const { get } = makeApp()
  const res = await get('/check?title=%3Cscript%3Ealert(1)%3C%2Fscript%3E&s=1&e=1')
  assert.equal(res.statusCode, 200)
  assert.ok(!res.body.includes('<script>alert(1)'))
  assert.ok(res.body.includes('&lt;script&gt;'))
})

test('unknown routes return a JSON 404', async () => {
  const { get } = makeApp()
  const res = await get('/definitely/not/a/route')
  assert.equal(res.statusCode, 404)
  assert.deepEqual(jsonOf(res), { error: 'not_found' })
})

test('HEAD requests get headers without a body', async () => {
  const { get } = makeApp()
  const res = await get('/manifest.json', 'HEAD')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body, '')
})

test('subtitle badge is disabled by default and can be enabled via env', async () => {
  // disabled: manifest has no subtitles resource
  const off = makeApp()
  const manifestOff = jsonOf(await off.get('/manifest.json'))
  assert.deepEqual(manifestOff.resources, ['stream'])
  const subsOff = jsonOf(await off.get('/subtitles/series/tt0409591:1:26.json'))
  assert.deepEqual(subsOff, { subtitles: [] })

  // enabled: manifest declares it and the track is returned
  const on = makeApp({ env: { ENABLE_SUBTITLE_BADGE: '1' } })
  const manifestOn = jsonOf(await on.get('/manifest.json'))
  assert.deepEqual(manifestOn.resources, ['stream', 'subtitles'])
  const subsOn = jsonOf(await on.get('/subtitles/series/tt0409591:1:26.json'))
  assert.equal(subsOn.subtitles.length, 1)
  const track = subsOn.subtitles[0]
  assert.equal(track.id, 'anime-filler-check')
  assert.equal(track.lang, 'zxx')
  assert.ok(track.label.includes('FILLER'))
  assert.ok(track.url.startsWith('https://demo.example/badge.vtt?'))

  const vtt = await on.get(`/badge.vtt?id=tt0409591&s=1&e=26`)
  assert.equal(vtt.statusCode, 200)
  assert.ok(vtt.headers['content-type'].includes('text/vtt'))
  assert.ok(vtt.body.startsWith('WEBVTT'))
  assert.ok(vtt.body.includes('FILLER'))
})

test('one warm lookup performs at most one metadata fetch and one filler-data fetch', async () => {
  const { get, fetchImpl } = makeApp()
  await get('/stream/series/tt0409591:1:26.json')
  const urls = fetchImpl.calls.map((c) => c.url)
  const cinemeta = urls.filter((u) => u.includes('cinemeta')).length
  const afl = urls.filter((u) => u.includes('animefillerlist')).length
  assert.equal(cinemeta, 1)
  assert.equal(afl, 1) // the Naruto page only — the index came from the bundled seed
})
