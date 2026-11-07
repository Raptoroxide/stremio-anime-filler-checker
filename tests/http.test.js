// Guarded HTTP layer: allowlist, UA, retries, size caps, host gaps, deadlines.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHttp, HttpError, USER_AGENT } from '../src/shared/http.js'
import { stubFetch } from './helpers.js'

test('only allowlisted https hosts can be fetched (SSRF guard)', async () => {
  const http = createHttp({ fetchImpl: stubFetch([]) })
  await assert.rejects(() => http.fetchText('https://evil.example.com/x'), /host not allowed/)
  await assert.rejects(() => http.fetchText('http://v3-cinemeta.strem.io/meta/series/tt1.json'), /host not allowed/)
  await assert.rejects(() => http.fetchText('not a url'), /invalid upstream url/)
})

test('a descriptive User-Agent is always sent', async () => {
  const fetchImpl = stubFetch([{ url: 'https://kitsu.io/api/edge/anime/12', body: '{}' }])
  const http = createHttp({ fetchImpl, policies: { 'kitsu.io': { minGapMs: 1 } } })
  await http.fetchText('https://kitsu.io/api/edge/anime/12')
  assert.equal(fetchImpl.calls[0].headers['User-Agent'], USER_AGENT)
  assert.ok(USER_AGENT.startsWith('AnimeFillerChecker'))
})

test('4xx responses fail fast without retry', async () => {
  const fetchImpl = stubFetch([{ url: 'https://kitsu.io/x', body: 'nope', status: 403 }])
  const http = createHttp({ fetchImpl, policies: { 'kitsu.io': { minGapMs: 1, retries: 1 } } })
  await assert.rejects(() => http.fetchText('https://kitsu.io/x'), (err) => err.status === 403)
  assert.equal(fetchImpl.calls.length, 1)
})

test('5xx responses are retried once, then fail', async () => {
  const fetchImpl = stubFetch([{ url: 'https://kitsu.io/x', body: 'boom', status: 500 }])
  const http = createHttp({ fetchImpl, policies: { 'kitsu.io': { minGapMs: 1, retries: 1 } } })
  await assert.rejects(() => http.fetchText('https://kitsu.io/x'), (err) => err.status === 500)
  assert.equal(fetchImpl.calls.length, 2)
})

test('network errors are retried, then surface as errors', async () => {
  const fetchImpl = stubFetch([], { defaultThrow: 'socket hang up' })
  const http = createHttp({ fetchImpl, policies: { 'kitsu.io': { minGapMs: 1, retries: 1 } } })
  await assert.rejects(() => http.fetchText('https://kitsu.io/x'), /socket hang up/)
  assert.equal(fetchImpl.calls.length, 2)
})

test('oversized responses are rejected (content-length precheck)', async () => {
  const fetchImpl = stubFetch([{ url: 'https://kitsu.io/x', body: 'x'.repeat(500) }])
  const http = createHttp({ fetchImpl, policies: { 'kitsu.io': { minGapMs: 1 } } })
  await assert.rejects(
    () => http.fetchText('https://kitsu.io/x', { sizeCapBytes: 50 }),
    /too large/
  )
})

test('per-host minimum gaps serialize requests (Crawl-delay support)', async () => {
  const fetchImpl = stubFetch([{ url: 'https://www.animefillerlist.com/shows', body: 'ok' }])
  const http = createHttp({ fetchImpl, policies: { 'www.animefillerlist.com': { minGapMs: 150, retries: 0 } } })
  const t0 = Date.now()
  await http.fetchText('https://www.animefillerlist.com/shows')
  await http.fetchText('https://www.animefillerlist.com/shows')
  const elapsed = Date.now() - t0
  assert.ok(elapsed >= 140, `expected a ~150ms gap, took ${elapsed}ms`)
  assert.equal(fetchImpl.calls.length, 2)
})

test('the request deadline short-circuits before fetching', async () => {
  const fetchImpl = stubFetch([{ url: 'https://kitsu.io/x', body: 'ok' }])
  const http = createHttp({ fetchImpl, policies: { 'kitsu.io': { minGapMs: 1 } } })
  await assert.rejects(
    () => http.fetchText('https://kitsu.io/x', { scope: { deadlineAt: Date.now() + 100 } }),
    /deadline/
  )
  assert.equal(fetchImpl.calls.length, 0)
})

test('fetchJson rejects invalid JSON', async () => {
  const fetchImpl = stubFetch([{ url: 'https://kitsu.io/x', body: '<html>not json</html>' }])
  const http = createHttp({ fetchImpl, policies: { 'kitsu.io': { minGapMs: 1 } } })
  await assert.rejects(() => http.fetchJson('https://kitsu.io/x'), /invalid JSON/)
})

test('HttpError carries status', () => {
  const e = new HttpError('boom', 503)
  assert.equal(e.status, 503)
  assert.equal(e.name, 'HttpError')
})
