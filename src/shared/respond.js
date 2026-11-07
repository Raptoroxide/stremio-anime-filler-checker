// HTTP response helpers: CORS, content types, cache headers.
// The Stremio Add-on Protocol requires CORS headers allowing all origins on
// every route (including /manifest.json).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400'
}

export const CACHE_CONTROL = Object.freeze({
  /** Successful stream/subtitle results — short client cache, longer edge cache. */
  RESULT: 'public, max-age=600, s-maxage=1800',
  /** Empty results (non-anime, unresolvable) — cheap and safe to cache briefly. */
  EMPTY: 'public, max-age=600',
  /** Manifest — allow brief caching. */
  MANIFEST: 'public, max-age=300',
  /** Landing page. */
  PAGE: 'public, max-age=300',
  /** Dynamic pages with timestamps / health / errors — never cache. */
  NONE: 'no-store'
})

function baseHeaders (contentType, cacheControl) {
  return {
    ...CORS_HEADERS,
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff'
  }
}

function finish (res, status, headers, body) {
  res.writeHead(status, headers)
  // HEAD requests get correct Content-Length but no body.
  if (res.req && res.req.method === 'HEAD') res.end()
  else res.end(body)
}

export function sendJson (res, status, body, cacheControl = CACHE_CONTROL.NONE) {
  const body_ = JSON.stringify(body)
  finish(res, status, baseHeaders('application/json; charset=utf-8', cacheControl), body_)
}

export function sendHtml (res, status, html, cacheControl = CACHE_CONTROL.PAGE) {
  finish(res, status, baseHeaders('text/html; charset=utf-8', cacheControl), html)
}

export function sendVtt (res, vtt, cacheControl = CACHE_CONTROL.RESULT) {
  finish(res, 200, baseHeaders('text/vtt; charset=utf-8', cacheControl), vtt)
}

/** CORS preflight. */
export function sendOptions (res) {
  res.writeHead(204, CORS_HEADERS)
  res.end()
}

export function sendNotFound (res) {
  sendJson(res, 404, { error: 'not_found' }, CACHE_CONTROL.NONE)
}

export function sendMethodNotAllowed (res) {
  finish(res, 405, baseHeaders('application/json; charset=utf-8', CACHE_CONTROL.NONE), JSON.stringify({ error: 'method_not_allowed' }))
}
