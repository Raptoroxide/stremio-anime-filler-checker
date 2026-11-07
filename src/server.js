// App factory + HTTP router. This is the single entry point used both by the
// Vercel function (api/index.js) and the local dev server (dev-server.mjs).
//
// Route map (see vercel.json for the rewrites that map these to /api/index):
//   GET  /                          landing page (install + info)
//   GET  /manifest.json             Stremio manifest
//   GET  /health                    JSON health check
//   GET  /check                     details page / manual lookup / help
//   GET  /badge.vtt                 optional WebVTT verdict badge
//   GET  /stream/series/{id}.json   informational stream row (Stremio protocol)
//   GET  /subtitles/series/{id}.json optional subtitle track (Stremio protocol)
//
// All responses carry CORS headers (Access-Control-Allow-Origin: *), correct
// Content-Type, and sensible Cache-Control. Errors never leak stack traces.

import { buildManifest } from './addon/manifest.js'
import { handleStream } from './addon/stream.js'
import { handleSubtitles, handleBadgeVtt } from './addon/subtitles.js'
import { resolveVerdict } from './addon/pipeline.js'
import { renderLanding } from './pages/landing.js'
import { renderCheckPage } from './pages/check.js'
import { createResolvers } from './metadata/index.js'
import { createProviders } from './providers/index.js'
import { createHttp } from './shared/http.js'
import { TTLCache } from './cache/memory.js'
import { sendJson, sendHtml, sendOptions, sendNotFound, sendMethodNotAllowed, CACHE_CONTROL } from './shared/respond.js'
import { sanitizeHost } from './shared/escape.js'
import { parseVideoId, parseSeasonEpisodeParams } from './shared/ids.js'
import { ADDON_NAME, VERSION } from './shared/types.js'

// Generous budget that still fits inside the 30s Vercel function duration
// (vercel.json). Normal lookups finish in well under a second once caches are
// warm; the budget only matters for rare cold paths that must wait out the
// AnimeFillerList Crawl-delay window.
const REQUEST_BUDGET_MS = 20000

export function createApp (options = {}) {
  const env = options.env || {}
  const now = options.now || (() => Date.now())
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const http = createHttp({ fetchImpl, policies: options.httpPolicies })
  const caches = {
    meta: new TTLCache({ maxEntries: 300 }),
    afl: new TTLCache({ maxEntries: 300 })
  }
  const resolvers = createResolvers({ http, now, cache: caches.meta, inflight: new Map() })
  const providers = createProviders({ http, now, cache: caches.afl })

  const app = {
    env,
    now,
    http,
    caches,
    resolvers,
    providers,
    enableSubtitles: String(env.ENABLE_SUBTITLE_BADGE || '') === '1'
  }

  function baseUrlFrom (req) {
    const headers = (req && req.headers) || {}
    const host = sanitizeHost(headers['x-forwarded-host'] || headers.host)
    if (!host) return { baseUrl: '', host: '' }
    let proto = 'http'
    const fwdProto = String(headers['x-forwarded-proto'] || '').split(',')[0].trim()
    if (fwdProto === 'https' || fwdProto === 'http') proto = fwdProto
    return { baseUrl: `${proto}://${host}`, host }
  }

  /** Decode path, tolerating both original URLs and /api-prefixed rewrite destinations. */
  function decodePath (url) {
    const raw = String(url || '/')
    const qIdx = raw.indexOf('?')
    const pathname = qIdx >= 0 ? raw.slice(0, qIdx) : raw
    const search = qIdx >= 0 ? raw.slice(qIdx) : ''
    let p = pathname
    try { p = decodeURIComponent(pathname) } catch { /* keep raw */ }
    if (p === '/api' || p === '/api/' || p === '/api/index') return { path: '/', search }
    if (p.startsWith('/api/')) p = p.slice(4)
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
    return { path: p || '/', search }
  }

  async function handleCheck (req, res, { query, baseUrl, scope }) {
    const title = String(query.get('title') || '').slice(0, 200).trim()
    const idParam = String(query.get('id') || '').slice(0, 64).trim()
    const se = parseSeasonEpisodeParams({
      season: query.get('season'),
      episode: query.get('episode'),
      s: query.get('s'),
      e: query.get('e'),
      ep: query.get('ep')
    })

    let result = null
    let lookupError = null
    if (se && (idParam || title)) {
      try {
        if (idParam) {
          let parsed = parseVideoId(idParam)
          if (parsed && parsed.season == null) parsed = { ...parsed, season: se.season, episode: se.episode }
          if (parsed && parsed.family !== 'unknown' && parsed.season != null && parsed.episode != null) {
            result = await resolveVerdict(app, { ref: parsed, season: parsed.season, episode: parsed.episode }, scope)
          } else {
            result = {
              identified: false,
              isAnime: false,
              meta: null,
              record: null,
              verdict: 'unknown',
              reason: 'bad-id',
              requested: se,
              error: 'This id could not be understood. Supported: IMDb ids like tt0409591 (optionally with :season:episode) and kitsu ids.'
            }
          }
        } else {
          result = await resolveVerdict(app, { title, season: se.season, episode: se.episode }, scope)
        }
      } catch (err) {
        lookupError = `Lookup failed: ${(err && err.message) || 'unexpected error'}`
      }
    }

    const snapshot = {
      label: query.get('label') || null,
      src: query.get('src') || null,
      at: query.get('at') || null
    }
    const html = renderCheckPage({ result, lookupError, query: { id: idParam, title }, snapshot, baseUrl })
    return sendHtml(res, 200, html, CACHE_CONTROL.NONE)
  }

  async function handle (req, res) {
    try {
      if (req.method === 'OPTIONS') return sendOptions(res)

      const isHead = req.method === 'HEAD'
      const method = isHead ? 'GET' : req.method
      if (method !== 'GET') return sendMethodNotAllowed(res)
      if (isHead) {
        // Correct HEAD semantics: headers (incl. Content-Length) without body.
        const origEnd = res.end.bind(res)
        res.end = function () { return origEnd() }
      }

      const { path, search } = decodePath(req.url)
      const query = new URLSearchParams(search)
      const scope = { deadlineAt: now() + REQUEST_BUDGET_MS }
      const { baseUrl, host } = baseUrlFrom(req)

      if (path === '/' || path === '/index.html') {
        return sendHtml(res, 200, renderLanding({ baseUrl, host }), CACHE_CONTROL.PAGE)
      }
      if (path === '/manifest.json') {
        return sendJson(res, 200, buildManifest({ enableSubtitles: app.enableSubtitles }), CACHE_CONTROL.MANIFEST)
      }
      if (path === '/health') {
        return sendJson(res, 200, {
          status: 'ok',
          name: ADDON_NAME,
          version: VERSION,
          time: new Date(now()).toISOString(),
          uptimeSec: Math.round(process.uptime()),
          subtitlesBadgeEnabled: app.enableSubtitles,
          caches: { meta: caches.meta.stats(), afl: caches.afl.stats() }
        }, CACHE_CONTROL.NONE)
      }
      if (path === '/check') {
        return handleCheck(req, res, { query, baseUrl, scope })
      }
      if (path === '/badge.vtt') {
        return handleBadgeVtt(app, req, res, { query, scope })
      }
      if (path.startsWith('/stream/')) {
        const parts = path.split('/') // ['', 'stream', type, videoId, ...extraArgs]
        const type = parts[2] || ''
        const videoId = parts[3] || ''
        if (!type || !videoId) return sendJson(res, 200, { streams: [] }, CACHE_CONTROL.EMPTY)
        return handleStream(app, req, res, { type, videoId, baseUrl, scope })
      }
      if (path.startsWith('/subtitles/')) {
        const parts = path.split('/')
        const type = parts[2] || ''
        const videoId = parts[3] || ''
        if (!type || !videoId) return sendJson(res, 200, { subtitles: [] }, CACHE_CONTROL.EMPTY)
        return handleSubtitles(app, req, res, { type, videoId, baseUrl, scope })
      }
      return sendNotFound(res)
    } catch (err) {
      console.error('[server] unhandled error:', err && err.message)
      const url = String((req && req.url) || '')
      try {
        if (url.includes('/stream/')) return sendJson(res, 200, { streams: [] }, CACHE_CONTROL.NONE)
        if (url.includes('/subtitles/')) return sendJson(res, 200, { subtitles: [] }, CACHE_CONTROL.NONE)
        return sendJson(res, 500, { error: 'internal_error' }, CACHE_CONTROL.NONE)
      } catch { /* response already sent */ }
    }
  }

  return { handle, app }
}
