// Kitsu resolver (optional id family). Kitsu is a public anime database with a
// documented, key-less JSON:API. Series ids look like `kitsu:12345`; videos
// like `kitsu:12345:1:2`. Kitsu entries are anime by definition, and most
// entries map to a single season, so season 1 maps directly to the absolute
// episode number; anything else falls back to UNKNOWN rather than guessing.

import { dedupe } from '../cache/memory.js'

const KITSU_BASE = 'https://kitsu.io/api/edge/anime'
const TTL = 24 * 60 * 60 * 1000
const TTL_ERROR = 30 * 60 * 1000

export function createKitsuResolver ({ http, now, cache, inflight = new Map() }) {
  async function resolveSeries (seriesId, scope) {
    const m = typeof seriesId === 'string' ? seriesId.match(/^kitsu:(\d{1,10})$/) : null
    if (!m) return null
    const numericId = m[1]
    const key = `kitsu:${numericId}`
    const hit = cache.peek(key, now())
    if (hit.state === 'fresh') return hit.value

    return dedupe(inflight, key, async () => {
      try {
        const url = `${KITSU_BASE}/${numericId}?fields[anime]=canonicalTitle,titles,startDate,episodeCount,subtype,status`
        const j = await http.fetchJson(url, { scope, headers: { Accept: 'application/vnd.api+json' } })
        const a = j && j.data && j.data.attributes
        if (!a || typeof a.canonicalTitle !== 'string' || !a.canonicalTitle) {
          throw new Error('kitsu: unexpected response shape')
        }
        const titles = (a.titles && typeof a.titles === 'object') ? a.titles : {}
        const aliases = [...new Set([titles.en, titles.en_jp, titles.ja_jp, a.canonicalTitle]
          .filter((x) => typeof x === 'string' && x))]
        const year = typeof a.startDate === 'string' && /(19|20)\d{2}/.test(a.startDate.slice(0, 4))
          ? Number(a.startDate.slice(0, 4))
          : null
        const episodeCount = Number(a.episodeCount)
        const counts = Number.isInteger(episodeCount) && episodeCount > 0 ? new Map([[1, episodeCount]]) : null
        const compact = {
          id: seriesId,
          family: 'kitsu',
          source: 'kitsu',
          title: a.canonicalTitle,
          year,
          genres: ['Animation'], // Kitsu is an anime database
          country: 'Japan',
          status: a.status === 'finished' ? 'ended' : 'ongoing',
          seasonCounts: counts,
          totalEpisodes: Number.isInteger(episodeCount) && episodeCount > 0 ? episodeCount : null,
          maxSeason: 1,
          aliases: aliases.slice(0, 6)
        }
        cache.set(key, compact, TTL, now())
        return compact
      } catch (err) {
        if (hit.state === 'stale') return { ...hit.value, stale: true }
        cache.set(key, null, TTL_ERROR, now())
        return null
      }
    })
  }

  return { name: 'Kitsu', resolveSeries }
}
