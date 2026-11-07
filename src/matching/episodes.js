// Season/episode → absolute episode number mapping.
//
// AnimeFillerList (and the FillerLists dataset) number episodes in original
// Japanese broadcast order, while Stremio/Cinemeta may expose several seasons.
// We derive the absolute number from Cinemeta's OWN season/episode metadata
// (cumulative counts of prior regular seasons). No invented formula like
// `season * 12 + episode` is ever used, and season 0 (specials) is never
// silently folded into regular numbering. When the derived number falls
// outside the source's episode list, the result is an explicit error that the
// caller turns into UNKNOWN.

/**
 * @param {Array<{season:number, number:number, episode?:number}>} videos
 * @returns {{counts: Map<number,number>, totalRegular: number, maxSeason: number}}
 *   counts maps season → highest episode number in that season (season 0 =
 *   specials, excluded from totalRegular).
 */
export function computeSeasonCounts (videos) {
  const counts = new Map()
  if (!Array.isArray(videos)) return { counts, totalRegular: 0, maxSeason: 0 }
  for (const v of videos) {
    if (!v || typeof v !== 'object') continue
    const season = Number(v.season)
    const number = Number(v.number != null ? v.number : v.episode)
    if (!Number.isInteger(season) || season < 0 || season > 100) continue
    if (!Number.isInteger(number) || number < 1 || number > 5000) continue
    counts.set(season, Math.max(counts.get(season) || 0, number))
  }
  let totalRegular = 0
  for (const [s, c] of counts) if (s >= 1) totalRegular += c
  let maxSeason = 0
  for (const s of counts.keys()) if (s > maxSeason) maxSeason = s
  return { counts, totalRegular, maxSeason }
}

/**
 * Map a Stremio (season, episode) to the source's absolute episode number.
 *
 * @returns {{absolute: number, confidence: 'high'|'medium'}|
 *           {{error: 'special'|'not-listed'|'no-mapping'|'season-unknown', absolute?: number}}
 */
export function mapToAbsolute ({ season, episode, seasonCounts, sourceTotal, seasonPage = false, pageMinEpisode = 1 }) {
  if (!Number.isInteger(season) || !Number.isInteger(episode)) return { error: 'no-mapping' }
  if (season === 0) return { error: 'special' }
  if (season < 0 || season > 100 || episode < 1 || episode > 5000) return { error: 'no-mapping' }

  const counts = seasonCounts && seasonCounts.size ? seasonCounts : null
  let absolute

  if (seasonPage && pageMinEpisode === 1) {
    // A season-specific source page that restarts numbering at 1.
    absolute = episode
  } else if (!counts) {
    // No season metadata available (e.g. Kitsu without episodeCount):
    // only season 1 can be mapped, directly.
    if (season !== 1) return { error: 'no-mapping' }
    absolute = episode
  } else {
    if (!counts.has(season)) return { error: 'season-unknown' }
    let offset = 0
    for (const [s, c] of counts) {
      if (s >= 1 && s < season) offset += c
    }
    absolute = offset + episode
  }

  if (sourceTotal != null && Number.isInteger(sourceTotal) && absolute > sourceTotal) {
    return { error: 'not-listed', absolute }
  }

  let confidence = 'medium'
  if (counts && sourceTotal != null && Number.isInteger(sourceTotal)) {
    let totalRegular = 0
    for (const [s, c] of counts) if (s >= 1) totalRegular += c
    confidence = totalRegular === sourceTotal ? 'high' : 'medium'
  }
  return { absolute, confidence }
}
