// Shared test helpers: Node http req/res mocks and a stubbed fetch with
// route table + call recording. No network access is needed for the suite.

import { readFileSync } from 'node:fs'

export function fixture (name) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

export function fixtureJson (name) {
  return JSON.parse(fixture(name))
}

export function mockReq (method, url, headers = {}) {
  return { method, url, headers }
}

export function mockRes () {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    ended: false
  }
  res.writeHead = (status, hdrs) => {
    res.statusCode = status
    // mimic Node's request-headers behaviour: lowercase keys
    for (const [k, v] of Object.entries(hdrs || {})) res.headers[String(k).toLowerCase()] = v
  }
  res.setHeader = (k, v) => { res.headers[k] = v }
  res.end = (body) => {
    if (body != null && body !== '') res.body += Buffer.isBuffer(body) ? body.toString() : String(body)
    res.ended = true
  }
  return res
}

export function jsonOf (res) {
  return JSON.parse(res.body)
}

/**
 * Build a stub fetch implementation.
 * routes: [{ url: 'https://exact/url' } | { prefix: 'https://prefix' },
 *          { body: string | (url) => string, status?: number, throw?: string }]
 * The `.calls` array records every invocation (url + request headers).
 */
export function stubFetch (routes = [], { defaultThrow = null } = {}) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, headers: (init && init.headers) || {} })
    for (const r of routes) {
      const hit = r.url !== undefined ? url === r.url : (r.prefix !== undefined ? url.startsWith(r.prefix) : false)
      if (!hit) continue
      if (r.throw) throw new Error(r.throw)
      const body = typeof r.body === 'function' ? r.body(url) : (r.body || '')
      const status = r.status || 200
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (k) => (String(k).toLowerCase() === 'content-length' ? String(body.length) : null) },
        text: async () => body
      }
    }
    if (defaultThrow) throw new Error(defaultThrow)
    return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' }
  }
  impl.calls = calls
  return impl
}

/** Shrink AnimeFillerList's Crawl-delay for tests. */
export const TEST_POLICIES = {
  'www.animefillerlist.com': { minGapMs: 5, timeoutMs: 2000, retries: 0 },
  'v3-cinemeta.strem.io': { minGapMs: 1, timeoutMs: 2000, retries: 0 },
  'kitsu.io': { minGapMs: 1, timeoutMs: 2000, retries: 0 }
}

export const scope = () => ({ deadlineAt: Date.now() + 15000 })

/** Standard route table used by the app-level tests. */
export function standardRoutes (overrides = []) {
  return [
    { url: 'https://v3-cinemeta.strem.io/meta/series/tt0409591.json', body: fixture('cinemeta-tt0409591.json') },
    { url: 'https://v3-cinemeta.strem.io/meta/series/tt2560140.json', body: fixture('cinemeta-tt2560140.json') },
    { url: 'https://v3-cinemeta.strem.io/meta/series/tt2861424.json', body: fixture('cinemeta-tt2861424.json') },
    { url: 'https://v3-cinemeta.strem.io/meta/series/tt9990001.json', body: fixture('cinemeta-tt9990001.json') },
    { url: 'https://www.animefillerlist.com/shows/naruto', body: fixture('afl-naruto.html') },
    { url: 'https://www.animefillerlist.com/shows/attack-titan', body: fixture('afl-attack-titan.html') },
    { url: 'https://www.animefillerlist.com/shows', body: fixture('afl-shows-index.html') },
    { url: 'https://kitsu.io/api/edge/anime/12?fields[anime]=canonicalTitle,titles,startDate,episodeCount,subtype,status', body: fixture('kitsu-12.json') },
    ...overrides
  ]
}
