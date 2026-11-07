// /stream/series/{videoId}.json handler.
//
// Returns a single informational stream row using a valid Stremio Stream
// object whose ONLY playable-source field is `externalUrl` (a Meta Link that
// opens the hosted details page). No fake url/infoHash/ytId is ever returned;
// non-anime and unresolvable items get an empty (but valid) response.

import { parseVideoId } from '../shared/ids.js'
import { STREAM_ROW_NAME, verdictLabel, UNKNOWN_REASONS } from '../shared/types.js'
import { CACHE_CONTROL, sendJson } from '../shared/respond.js'
import { truncate } from '../shared/escape.js'
import { resolveVerdict } from './pipeline.js'

/** Human-readable episode reference for row descriptions. */
export function describeEpisode ({ season, episode, absolute, seasonPage }) {
  if (season === 0) return `Special S0E${episode}`
  if (seasonPage || (season === 1 && absolute === episode)) return `Episode ${absolute}`
  return `S${season}E${episode} → Episode ${absolute}`
}

export function buildStreamRow (baseUrl, result) {
  const { record, requested, meta } = result
  const title = truncate((meta && meta.title) || (record && record.seriesTitle) || 'Unknown series', 40)

  const params = new URLSearchParams()
  if (result.ref) {
    params.set('id', result.ref.seriesId)
  } else {
    params.set('title', title)
  }
  params.set('s', String(requested.season))
  params.set('e', String(requested.episode))

  let description
  if (record && record.verdict && record.verdict !== 'unknown') {
    const episodeText = describeEpisode({
      season: requested.season,
      episode: requested.episode,
      absolute: record.episodeNumber,
      seasonPage: record.seasonPage
    })
    const cachedNote = record.fromCache ? ' · cached' : ''
    description = `${verdictLabel(record.verdict)} · ${title} · ${episodeText} · Source: ${record.sourceName}${cachedNote}`
    params.set('label', record.verdict)
    params.set('src', record.sourceName)
    if (record.checkedAt) params.set('at', String(record.checkedAt).slice(0, 10))
  } else {
    const reasonKey = (record && record.reason) || result.reason || 'no-data'
    const reason = UNKNOWN_REASONS[reasonKey] || UNKNOWN_REASONS['no-data']
    const episodeText = requested.season === 0
      ? `Special S0E${requested.episode}`
      : `S${requested.season}E${requested.episode}`
    description = `UNKNOWN · ${title} · ${episodeText} · ${reason}`
    if (record) {
      params.set('label', 'unknown')
      if (record.sourceName) params.set('src', record.sourceName)
    }
  }

  return {
    name: STREAM_ROW_NAME,
    description,
    externalUrl: `${baseUrl}/check?${params.toString()}`
  }
}

export async function handleStream (app, req, res, { type, videoId, baseUrl, scope }) {
  const started = app.now()
  if (type !== 'series') {
    return sendJson(res, 200, { streams: [] }, CACHE_CONTROL.EMPTY)
  }
  const parsed = parseVideoId(videoId)
  if (!parsed || parsed.family === 'unknown' || parsed.season == null || parsed.episode == null) {
    return sendJson(res, 200, { streams: [] }, CACHE_CONTROL.EMPTY)
  }

  let result
  try {
    result = await resolveVerdict(app, { ref: parsed, season: parsed.season, episode: parsed.episode }, scope)
  } catch (err) {
    console.error('[stream] pipeline error:', err && err.message)
    return sendJson(res, 200, { streams: [] }, CACHE_CONTROL.NONE)
  }

  if (!result.isAnime) {
    console.log(`[stream] ${videoId} → not anime, no row (${app.now() - started}ms)`)
    // A resolved non-anime series is a stable fact (brief caching is fine);
    // a metadata outage is transient and must not be cached.
    const cacheControl = result.identified === false ? CACHE_CONTROL.NONE : CACHE_CONTROL.EMPTY
    return sendJson(res, 200, { streams: [] }, cacheControl)
  }

  const row = buildStreamRow(baseUrl, result)
  console.log(`[stream] ${videoId} → ${result.verdict}${result.provider ? ` (${result.provider})` : ''} (${app.now() - started}ms)`)
  return sendJson(res, 200, { streams: [row] }, CACHE_CONTROL.RESULT)
}
