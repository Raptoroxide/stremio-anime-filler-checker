// Cinemeta resolver: turns IMDb series ids into compact, validated metadata.
// Cinemeta is Stremio's official public metadata add-on (no key required):
//   https://v3-cinemeta.strem.io/meta/series/{imdbId}.json

import { computeSeasonCounts } from '../matching/episodes.js'
import { dedupe } from '../cache/memory.js'

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io/meta/series'
const TTL_ENDED = 7 * 24 * 60 * 60 * 1000 // completed shows: metadata rarely changes
const TTL_ONGOING = 12 * 60 * 60 * 1000
const TTL_ERROR = 10 * 60 * 1000 // do not hammer a failing source

function pickGenres (m) {
  if (Array.isArray(m.genres)) return m.genres.filter((x) => typeof x === 'string')
  if (Array.isArray(m.genre)) return m.genre.filter((x) => typeof x === 'string')
  if (typeof m.genre === 'string') return m.genre.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

function parseYear (m) {
  const raw = typeof m.year === 'string' ? m.year : (typeof m.releaseInfo === 'string' ? m.releaseInfo : '')
  const match = raw.match(/(?:19|20)\d{2}/)
  return match ? Number(match[0]) : null
}

export function createCinemetaResolver ({ http, now, cache, inflight = new Map() }) {
  async function resolveSeries (imdbId, scope) {
    if (typeof imdbId !== 'string' || !/^tt\d{5,10}$/.test(imdbId)) return null
    const key = `cinemeta:${imdbId}`
    const hit = cache.peek(key, now())
    if (hit.state === 'fresh') return hit.value

    return dedupe(inflight, key, async () => {
      try {
        const j = await http.fetchJson(`${CINEMETA_BASE}/${imdbId}.json`, { scope })
        const m = j && j.meta
        if (!m || typeof m.name !== 'string' || !m.name) {
          throw new Error('cinemeta: unexpected response shape')
        }
        const { counts, totalRegular, maxSeason } = computeSeasonCounts(m.videos)
        const compact = {
          id: imdbId,
          family: 'imdb',
          source: 'cinemeta',
          title: m.name,
          year: parseYear(m),
          genres: pickGenres(m),
          country: typeof m.country === 'string' ? m.country : '',
          status: m.status === 'Ended' ? 'ended' : 'ongoing',
          seasonCounts: counts,
          totalEpisodes: totalRegular,
          maxSeason,
          aliases: []
        }
        cache.set(key, compact, compact.status === 'ended' ? TTL_ENDED : TTL_ONGOING, now())
        return compact
      } catch (err) {
        if (hit.state === 'stale') return { ...hit.value, stale: true }
        cache.set(key, null, TTL_ERROR, now())
        return null
      }
    })
  }

  return { name: 'Cinemeta', resolveSeries }
}
