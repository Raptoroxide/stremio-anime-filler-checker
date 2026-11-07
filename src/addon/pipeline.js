// The lookup pipeline shared by the stream handler, the details page and the
// optional subtitle badge.
//
// Steps: resolve series metadata → decide whether this is anime → consult the
// filler-data providers in priority order → produce a CheckResult.
//
// Anime identification (deliberately conservative):
//   - a Kitsu id is anime by definition (Kitsu is an anime database);
//   - a manual title lookup on /check is treated as an anime query;
//   - otherwise the Cinemeta metadata must have genre "Animation" AND country
//     "Japan". Western animation (which usually fails the Japan check) and
//     live-action namesakes (which lack the Animation genre) therefore get NO
//     informational row at all, rather than a misleading UNKNOWN row.
//
// UNKNOWN is only shown when the series is confidently anime but the episode
// could not be classified (no source data, episode not listed, specials,
// unmappable numbering). Verdicts are never guessed.

export function isAnimeSuspect (meta, { manual = false } = {}) {
  if (!meta) return false
  if (manual) return true
  if (meta.family === 'kitsu') return true
  const genres = Array.isArray(meta.genres) ? meta.genres.map((g) => String(g).toLowerCase()) : []
  const isAnimation = genres.includes('animation')
  const isJapan = typeof meta.country === 'string' && /japan/i.test(meta.country)
  return isAnimation && isJapan
}

/**
 * @param {object} app — app context from createApp()
 * @param {{ref?: {family:string, seriesId:string}|null, title?: string|null,
 *          season: number, episode: number}} input
 * @param {{deadlineAt: number}} scope
 */
export async function resolveVerdict (app, input, scope) {
  const { ref = null, title = null, season, episode } = input
  const requested = { season, episode }

  let meta = null
  if (ref) {
    meta = await app.resolvers.resolve(ref, scope)
  }

  if (!meta && !title) {
    return {
      identified: false,
      isAnime: false,
      meta: null,
      ref,
      record: null,
      provider: null,
      verdict: 'unknown',
      reason: 'meta-failed',
      requested,
      error: 'Series metadata could not be resolved (the metadata source may be unavailable).'
    }
  }

  const manual = !meta
  if (manual) {
    meta = {
      id: null,
      family: 'manual',
      source: 'manual',
      title,
      year: null,
      genres: [],
      country: '',
      status: null,
      seasonCounts: null,
      totalEpisodes: null,
      aliases: []
    }
  }

  const suspect = isAnimeSuspect(meta, { manual })

  if (!suspect) {
    // Not confidently anime → no informational row (see module comment).
    return { identified: true, isAnime: false, meta, ref, record: null, provider: null, verdict: null, reason: 'not-anime', requested, error: null }
  }

  const args = {
    title: meta.title,
    aliases: Array.isArray(meta.aliases) ? meta.aliases : [],
    year: meta.year || null,
    season,
    episode,
    seasonCounts: meta.seasonCounts || null,
    imdbId: ref && ref.family === 'imdb' ? ref.seriesId : null
  }

  const { record, provider, errors } = await app.providers.lookup(args, scope, { allowFetch: true })

  if (record) {
    return { identified: true, isAnime: true, meta, ref, record, provider, verdict: record.verdict, reason: record.reason || null, requested, errors: errors || [] }
  }

  return {
    identified: true,
    isAnime: true,
    meta,
    ref,
    record: null,
    provider: null,
    verdict: 'unknown',
    reason: 'no-data',
    requested,
    errors: errors || [],
    error: errors && errors.length ? `Data sources were unavailable: ${errors.join('; ')}` : null
  }
}
