// Optional informational WebVTT "badge" subtitle (DISABLED by default).
//
// Enable with the environment variable ENABLE_SUBTITLE_BADGE=1 (see
// .env.example). When enabled the manifest also declares the `subtitles`
// resource, and Stremio's subtitle picker will show one track per episode
// labelled "Anime Filler Check · <VERDICT>". Selecting it shows the verdict
// as a caption for the first seconds of playback. The main stream-row feature
// does not depend on this in any way.

import { parseVideoId } from '../shared/ids.js'
import { verdictLabel } from '../shared/types.js'
import { CACHE_CONTROL, sendJson, sendVtt } from '../shared/respond.js'
import { resolveVerdict } from './pipeline.js'
import { describeEpisode } from './stream.js'

const BADGE_ID = 'anime-filler-check'

export async function handleSubtitles (app, req, res, { type, videoId, baseUrl, scope }) {
  if (!app.enableSubtitles || type !== 'series') {
    return sendJson(res, 200, { subtitles: [] }, CACHE_CONTROL.EMPTY)
  }
  const parsed = parseVideoId(videoId)
  if (!parsed || parsed.family === 'unknown' || parsed.season == null || parsed.episode == null) {
    return sendJson(res, 200, { subtitles: [] }, CACHE_CONTROL.EMPTY)
  }

  let result
  try {
    result = await resolveVerdict(app, { ref: parsed, season: parsed.season, episode: parsed.episode }, scope)
  } catch (err) {
    console.error('[subtitles] pipeline error:', err && err.message)
    return sendJson(res, 200, { subtitles: [] }, CACHE_CONTROL.NONE)
  }

  if (!result.isAnime) return sendJson(res, 200, { subtitles: [] }, CACHE_CONTROL.EMPTY)

  const params = new URLSearchParams()
  params.set('id', parsed.seriesId)
  params.set('s', String(parsed.season))
  params.set('e', String(parsed.episode))
  const track = {
    id: BADGE_ID,
    url: `${baseUrl}/badge.vtt?${params.toString()}`,
    // 'zxx' is the ISO 639-2 code for "no linguistic content"; the visible
    // name comes from `label` below.
    lang: 'zxx',
    label: `Anime Filler Check · ${verdictLabel(result.verdict)}`
  }
  return sendJson(res, 200, { subtitles: [track] }, CACHE_CONTROL.RESULT)
}

export async function handleBadgeVtt (app, req, res, { query, scope }) {
  const idParam = String(query.get('id') || '').slice(0, 64).trim()
  const s = Number(query.get('s'))
  const e = Number(query.get('e'))
  if (!idParam || !Number.isInteger(s) || !Number.isInteger(e)) {
    return sendVtt(res, 'WEBVTT\n', CACHE_CONTROL.NONE)
  }
  const parsed = parseVideoId(`${idParam}:${s}:${e}`)
  if (!parsed || parsed.family === 'unknown') {
    return sendVtt(res, 'WEBVTT\n', CACHE_CONTROL.NONE)
  }

  let result
  try {
    result = await resolveVerdict(app, { ref: parsed, season: parsed.season, episode: parsed.episode }, scope)
  } catch (err) {
    return sendVtt(res, 'WEBVTT\n', CACHE_CONTROL.NONE)
  }

  let line
  if (result && result.isAnime && result.record && result.record.verdict && result.record.verdict !== 'unknown') {
    const epText = describeEpisode({
      season: parsed.season,
      episode: parsed.episode,
      absolute: result.record.episodeNumber,
      seasonPage: result.record.seasonPage
    })
    line = `Anime Filler Check: ${verdictLabel(result.record.verdict)} — ${result.meta.title}, ${epText} (Source: ${result.record.sourceName})`
  } else if (result && result.isAnime) {
    line = `Anime Filler Check: UNKNOWN — ${result.meta ? result.meta.title : 'this episode'} could not be classified`
  } else {
    return sendVtt(res, 'WEBVTT\n', CACHE_CONTROL.NONE)
  }

  const vtt = [
    'WEBVTT',
    '',
    '00:00:00.500 --> 00:00:08.000',
    line.replace(/[\r\n]+/g, ' '),
    ''
  ].join('\n')
  return sendVtt(res, vtt, CACHE_CONTROL.RESULT)
}
