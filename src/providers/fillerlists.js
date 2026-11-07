// FillerLists provider (bundled fallback dataset, CC BY-SA 4.0).
//
// FillerLists (https://fillerlists.com/data) publishes per-episode filler
// data for 13 long-running anime under CC BY-SA 4.0. A trimmed adaptation of
// that dataset is bundled with this project (see
// src/providers/data/fillerlists-bundle.js and CREDITS.md). This provider is
// consulted only when AnimeFillerList has no data or is unavailable, so a
// single lookup still needs at most one live filler-data source.
//
// The dataset contains per-show IMDb ids, which give exact, fuzzy-free
// matching for Cinemeta requests.

import { findShowMatch } from '../matching/match.js'
import { mapToAbsolute } from '../matching/episodes.js'
import { normalizeVerdictKey } from '../shared/types.js'
import { FILLERLISTS_BUNDLE } from './data/fillerlists-bundle.js'

function prepareShows () {
  return FILLERLISTS_BUNDLE.shows.map((show) => {
    const episodes = new Map()
    let maxEpisode = 0
    for (const [n, code] of Object.entries(show.ep || {})) {
      const number = Number(n)
      if (!Number.isInteger(number) || number < 1 || number > 3000) continue
      episodes.set(number, normalizeVerdictKey(code))
      if (number > maxEpisode) maxEpisode = number
    }
    return { ...show, episodes, maxEpisode }
  })
}

export function createFillerListsProvider ({ now }) {
  const prepared = prepareShows()
  const checkedAt = new Date(FILLERLISTS_BUNDLE.retrievedAt || now()).toISOString()

  function unknownRecord (args, show, reason, absolute) {
    return {
      verdict: 'unknown',
      reason,
      seriesTitle: args.title,
      showTitle: show ? show.name : '',
      episodeNumber: Number.isInteger(absolute) ? absolute : null,
      episodeTitle: undefined,
      seasonPage: false,
      mappingConfidence: 'medium',
      sourceName: 'FillerLists',
      sourceUrl: show ? show.url : 'https://fillerlists.com/data',
      sourceUpdatedAt: show ? show.lastChecked : undefined,
      checkedAt,
      fromCache: true
    }
  }

  async function lookup (args) {
    let show = null
    // 1. Strongest evidence: exact IMDb id match.
    if (args.imdbId) {
      show = prepared.find((s) => s.imdbId === args.imdbId)
    }
    // 2. Title/alias match (exact normalized, conservative fuzzy).
    if (!show) {
      const match = findShowMatch(FILLERLISTS_BUNDLE.shows, {
        title: args.title,
        aliases: args.aliases,
        year: args.year,
        season: args.season
      })
      if (match) show = prepared.find((s) => s.slug === match.entry.slug)
    }
    if (!show) return { status: 'no-match' }

    const mapping = mapToAbsolute({
      season: args.season,
      episode: args.episode,
      seasonCounts: args.seasonCounts,
      sourceTotal: show.maxEpisode,
      seasonPage: false,
      pageMinEpisode: 1
    })
    if (mapping.error) {
      return { status: 'ok', record: unknownRecord(args, show, mapping.error, mapping.absolute) }
    }

    const verdict = show.episodes.get(mapping.absolute)
    if (!verdict) {
      return { status: 'ok', record: unknownRecord(args, show, 'not-listed', mapping.absolute) }
    }

    return {
      status: 'ok',
      record: {
        verdict,
        reason: undefined,
        seriesTitle: args.title,
        showTitle: show.name,
        episodeNumber: mapping.absolute,
        episodeTitle: undefined,
        seasonPage: false,
        mappingConfidence: mapping.confidence,
        sourceName: 'FillerLists',
        sourceUrl: show.url,
        sourceUpdatedAt: show.lastChecked,
        checkedAt,
        fromCache: false // bundled dataset — served locally, never stale
      }
    }
  }

  return { name: 'FillerLists', lookup, bundle: FILLERLISTS_BUNDLE }
}
