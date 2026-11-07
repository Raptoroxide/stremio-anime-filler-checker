// Parsing of Stremio video IDs and explicit season/episode tokens.
//
// Stremio's Cinemeta video IDs look like `tt3107288:1:1` (series:season:episode).
// Other metadata add-ons use their own families; we explicitly recognize the
// Cinemeta/IMDb family and the kitsu family, and safely reject everything else
// instead of guessing numbers out of arbitrary IDs.

const IMDB_ID = 'tt\\d{5,10}'

/**
 * Parse a Stremio video id (as it appears in a /stream/series/{videoId}.json
 * request, possibly URL-encoded and possibly with a trailing `.json`).
 *
 * Returns:
 *   { family: 'imdb'|'kitsu', seriesId, season, episode }  — usable video id
 *   { family: 'imdb'|'kitsu', seriesId, season: null, episode: null } — series-level id
 *   { family: 'unknown', ... } — not a recognized id family (no guessing)
 *   null — malformed input (too long / wrong shape)
 */
export function parseVideoId (raw) {
  if (typeof raw !== 'string') return null
  let id = raw.trim()
  if (id.length < 2 || id.length > 128) return null
  if (/\.json$/i.test(id)) id = id.slice(0, -5)
  if (id.includes('%')) {
    try { id = decodeURIComponent(id) } catch { /* keep original */ }
  }
  if (!id || /[\s/]/.test(id)) return null

  let m = id.match(new RegExp(`^(${IMDB_ID}):(\\d{1,4}):(\\d{1,5})$`))
  if (m) {
    const season = Number(m[2]); const episode = Number(m[3])
    if (episode < 1 || season > 200) return { family: 'imdb', seriesId: m[1], season: null, episode: null }
    return { family: 'imdb', seriesId: m[1], season, episode }
  }
  m = id.match(new RegExp(`^(${IMDB_ID})$`))
  if (m) return { family: 'imdb', seriesId: m[1], season: null, episode: null }

  m = id.match(/^kitsu:(\d{1,10}):(\d{1,4}):(\d{1,5})$/i)
  if (m) {
    const season = Number(m[2]); const episode = Number(m[3])
    if (episode < 1 || season > 200) return { family: 'kitsu', seriesId: `kitsu:${m[1]}`, season: null, episode: null }
    return { family: 'kitsu', seriesId: `kitsu:${m[1]}`, season, episode }
  }
  m = id.match(/^kitsu:(\d{1,10})$/i)
  if (m) return { family: 'kitsu', seriesId: `kitsu:${m[1]}`, season: null, episode: null }

  return { family: 'unknown', seriesId: id.slice(0, 64), season: null, episode: null }
}

/**
 * Parse an EXPLICIT, unambiguous season/episode token. Supported shapes:
 *   S01E02 / s1e2   ·   1x02 / 12x345   ·   1:2 (season:episode)
 * These are only honoured when a caller explicitly passes such a token (for
 * example the `ep` parameter of the /check page). Arbitrary ids ending in two
 * numbers are NEVER interpreted this way.
 */
export function parseEpisodeToken (token) {
  if (typeof token !== 'string') return null
  const t = token.trim().toLowerCase()
  if (!t || t.length > 12) return null
  let m = t.match(/^s(\d{1,3})e(\d{1,4})$/)
  if (m) return { season: Number(m[1]), episode: Number(m[2]) }
  m = t.match(/^(\d{1,3})x(\d{1,4})$/)
  if (m) return { season: Number(m[1]), episode: Number(m[2]) }
  m = t.match(/^(\d{1,3}):(\d{1,4})$/)
  if (m) return { season: Number(m[1]), episode: Number(m[2]) }
  return null
}

function toInt (value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isInteger(n) ? n : null
}

/**
 * Resolve season/episode from query-style parameters:
 *   season=1&episode=2   ·   s=1&e=2   ·   ep=S01E02 (explicit token)
 * Returns { season, episode } or null.
 */
export function parseSeasonEpisodeParams ({ season, episode, s, e, ep }) {
  if (ep != null && ep !== '') {
    const r = parseEpisodeToken(String(ep))
    if (r) return r
  }
  const sn = toInt(season != null && season !== '' ? season : s)
  const en = toInt(episode != null && episode !== '' ? episode : e)
  if (sn == null || en == null) return null
  if (sn < 0 || sn > 200 || en < 1 || en > 5000) return null
  return { season: sn, episode: en }
}
