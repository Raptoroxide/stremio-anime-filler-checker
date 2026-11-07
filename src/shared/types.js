// Shared constants: add-on identity, verdict taxonomy, and source verdict mapping.

export const VERSION = '1.0.0'
export const ADDON_ID = 'org.raptoroxide.animefillerchecker'
export const ADDON_NAME = 'Anime Filler Checker'
export const ADDON_DESCRIPTION =
  'Shows whether an anime episode is Manga Canon, Anime Canon, Mixed Canon/Filler, Filler, or Unknown. ' +
  'Adds a clearly-labelled informational row (no video streams) with a link to full details and sources.'

export const STREAM_ROW_NAME = 'ANIME FILLER CHECK'

/**
 * The five supported verdicts. `meaning` is shown on the details page.
 * Colour is never the only signal: the label text always carries the verdict.
 */
export const VERDICTS = Object.freeze({
  'manga-canon': {
    label: 'MANGA CANON',
    css: 'verdict-manga-canon',
    meaning: 'This episode is adapted from the original manga (or the main source material).'
  },
  'anime-canon': {
    label: 'ANIME CANON',
    css: 'verdict-anime-canon',
    meaning: 'This episode is anime-original material that the cited source considers part of the official anime continuity.'
  },
  mixed: {
    label: 'MIXED CANON/FILLER',
    css: 'verdict-mixed',
    meaning: 'This episode contains both canon and filler material. It may include important story content — do not skip it automatically.'
  },
  filler: {
    label: 'FILLER',
    css: 'verdict-filler',
    meaning: 'This episode is not adapted from the manga and is classified as filler by the cited source.'
  },
  unknown: {
    label: 'UNKNOWN',
    css: 'verdict-unknown',
    meaning: 'No reliable classification could be determined for this episode. Nothing is guessed.'
  }
})

/** Human-readable explanations for each UNKNOWN reason (also used in stream rows). */
export const UNKNOWN_REASONS = Object.freeze({
  'no-data': 'no reliable episode data found',
  'not-listed': 'episode not listed by the source (data may not cover it yet)',
  special: 'specials and OVAs are not reliably classified',
  mapping: 'season numbering could not be mapped reliably',
  conflict: 'sources disagree and the conflict is not settled'
})

/**
 * Normalize a verdict label from any supported source into one of the five
 * verdict keys. Handles:
 *  - AnimeFillerList row classes / type text: manga_canon, mixed_canon/filler,
 *    filler, anime_canon, "Manga Canon", "Mixed Canon/Filler", ...
 *  - FillerLists types: canon, anime-canon, mixed, filler, unknown
 *  - the single-letter codes used in the bundled dataset: c, a, m, f, u
 *
 * Unknown/unparseable input maps to "unknown" — never to a canon verdict.
 */
export function normalizeVerdictKey (raw) {
  const key = String(raw == null ? '' : raw).toLowerCase().replace(/[^a-z]/g, '')
  switch (key) {
    case 'mangacanon':
    case 'canon':
    case 'c':
      return 'manga-canon'
    case 'animecanon':
    case 'a':
      return 'anime-canon'
    case 'mixedcanonfiller':
    case 'mixed':
    case 'm':
      return 'mixed'
    case 'filler':
    case 'f':
      return 'filler'
    default:
      return 'unknown'
  }
}

/** Verdict label used in stream row descriptions. */
export function verdictLabel (verdict) {
  return (VERDICTS[verdict] || VERDICTS.unknown).label
}
