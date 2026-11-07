// Show matching: exact normalized title/alias match first, year disambiguation
// for remakes, optional season-page candidates, and — as a last resort — a
// deliberately conservative fuzzy match that refuses close calls.
//
// The matcher NEVER uses substring containment: "Naruto" must not match
// "Naruto Shippuden" or "Boruto: Naruto Next Generations".
//
// Parentheticals in source titles are treated as alternate names:
//   "Attack on Titan (Shingeki no Kyojin)"  → primary "attack on titan",
//   alias "shingeki no kyojin". A year in parentheses (e.g. "Berserk (2016)")
//   is recorded as the entry's year instead.
// Leading "the" is matched in a second tier, so "The One Piece" and
// "One Piece" remain distinct series.

import { normalizeTitle, splitYearSuffix } from './normalize.js'

const FUZZY_THRESHOLD = 0.92
const FUZZY_MARGIN = 0.05
const MAX_LEN = 160

const preparedCache = new WeakMap()

function stripLeadingThe (s) {
  return s.startsWith('the ') ? s.slice(4) : s
}

/**
 * Split a raw title into { primary, aliases, year }:
 *  - every parenthetical group is removed from the primary form;
 *  - a group that is a plausible year becomes the entry year;
 *  - other groups (≥ 3 chars) become alternate names.
 */
function splitTitleParts (rawTitle) {
  const raw = String(rawTitle)
  const aliasesRaw = []
  let year = null
  let primary = raw.replace(/\(([^()]*)\)/g, (_, inner) => {
    const content = String(inner).trim()
    if (/^(19|20)\d{2}$/.test(content)) {
      year = Number(content)
    } else if (content.length >= 3) {
      aliasesRaw.push(content)
    }
    return ' '
  })
  primary = primary.replace(/\s+/g, ' ').trim()
  if (!primary) primary = raw
  return { primary, aliasesRaw, year }
}

function prepare (entries) {
  let prepared = preparedCache.get(entries)
  if (prepared) return prepared
  prepared = []
  for (const e of entries || []) {
    const title = e.title ?? e.name
    if (typeof title !== 'string' || !title) continue
    const norm = normalizeTitle(title)
    if (!norm) continue
    const { primary, aliasesRaw, year: parenYear } = splitTitleParts(title)
    const primaryNorm = normalizeTitle(primary) || norm
    const primaryParts = splitYearSuffix(primaryNorm)
    const suffix = splitYearSuffix(norm)
    prepared.push({
      entry: e,
      title,
      norm,
      base: suffix.base,
      year: suffix.year || parenYear,
      primary: primaryNorm,
      primaryBase: primaryParts.base,
      aliases: aliasesRaw.map(normalizeTitle).filter(Boolean).slice(0, 4)
    })
  }
  preparedCache.set(entries, prepared)
  return prepared
}

/** Classic Levenshtein distance with a length-difference short-circuit. */
export function levenshtein (a, b) {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  if (Math.abs(a.length - b.length) > 40) return 999
  let prev = new Array(b.length + 1)
  let cur = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    const t = prev; prev = cur; cur = t
  }
  return prev[b.length]
}

export function similarity (a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length > MAX_LEN || b.length > MAX_LEN) return 0
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}

/**
 * When several entries match a title exactly, disambiguate by year
 * (e.g. "Hunter × Hunter" vs "Hunter × Hunter (2011)"). Without enough
 * evidence the matcher returns no match rather than guessing.
 */
function refineByYear (cands, year) {
  if (cands.length <= 1) return cands
  if (year != null) {
    const withYear = cands.filter((c) => c.year != null && Math.abs(c.year - year) <= 1)
    if (withYear.length === 1) return withYear
    if (withYear.length > 1) return null
  }
  const withoutYear = cands.filter((c) => c.year == null)
  if (withoutYear.length === 1) return withoutYear
  return null
}

function entryForms (cand, { useAliases = false } = {}) {
  const forms = [cand.norm, cand.base, cand.primary, cand.primaryBase]
  if (useAliases) forms.push(...cand.aliases)
  return forms
}

function collectTier (prepared, queries, { useAliases = false, stripThe = false } = {}) {
  const q = stripThe ? queries.map(stripLeadingThe) : queries
  const out = []
  for (const cand of prepared) {
    const forms = entryForms(cand, { useAliases }).map((f) => (stripThe ? stripLeadingThe(f) : f))
    if (forms.some((form) => q.includes(form))) out.push(cand)
  }
  return out
}

/**
 * Find the best show for a query.
 *
 * @param {Array<{slug?:string, title?:string, name?:string, id?:string}>} entries
 * @param {{title: string, aliases?: string[], year?: number|null, season?: number|null}} query
 * @returns {{entry: object, title: string, method: 'exact'|'season-page'|'fuzzy', confidence: 'high'|'medium'}|null}
 */
export function findShowMatch (entries, { title, aliases = [], year = null, season = null } = {}) {
  const prepared = prepare(entries)
  if (!prepared.length) return null

  const rawNames = [title, ...aliases].filter((n) => typeof n === 'string' && n)
  const names = [...new Set(rawNames.map(normalizeTitle).filter(Boolean))]
  if (!names.length) return null
  const nameBases = [...new Set(names.map((n) => splitYearSuffix(n).base))]
  const queries = [...names, ...nameBases]

  // 1. Season-specific page candidates (only for season >= 2), e.g.
  //    "Title Season 2". AnimeFillerList currently uses one page per series,
  //    but this stays correct if season pages exist.
  if (season != null && season >= 2 && season <= 50) {
    for (const base of queries) {
      for (const suffix of [`season ${season}`, `s${season}`, `part ${season}`]) {
        const want = `${base} ${suffix}`
        const hit = prepared.find((c) => c.norm === want || c.base === want || c.primary === want || c.primaryBase === want)
        if (hit) return { entry: hit.entry, title: hit.title, method: 'season-page', confidence: 'high' }
      }
    }
  }

  // 2. Exact matches, in tiers:
  //    tier 1 — full/primary forms ("One Piece" matches "One Piece")
  //    tier 2 — leading-"the"-insensitive ("One Piece" matches "The One Piece"
  //             only when nothing matched tier 1)
  //    tier 3 — parenthetical alternate names ("Shingeki no Kyojin" matches
  //             "Attack on Titan (Shingeki no Kyojin)")
  //    A tier with several unresolved candidates means real ambiguity → no
  //    match rather than a guess.
  const tiers = [
    collectTier(prepared, queries),
    collectTier(prepared, queries, { stripThe: true }),
    collectTier(prepared, queries, { useAliases: true })
  ]
  for (const cands of tiers) {
    if (!cands.length) continue
    const refined = refineByYear(cands, year)
    if (!refined || refined.length !== 1) return null
    return { entry: refined[0].entry, title: refined[0].title, method: 'exact', confidence: 'high' }
  }

  // 3. Conservative fuzzy fallback: only a clear, unique near-match qualifies.
  let best = null
  let bestScore = 0
  let secondScore = 0
  for (const cand of prepared) {
    let score = 0
    for (const n of names) {
      let s = 0
      for (const form of entryForms(cand)) {
        const sim = similarity(n, form)
        if (sim > s) s = sim
      }
      if (s > score) score = s
    }
    if (score > bestScore) {
      secondScore = bestScore
      bestScore = score
      best = cand
    } else if (score > secondScore) {
      secondScore = score
    }
  }
  if (best && bestScore >= FUZZY_THRESHOLD && bestScore - secondScore >= FUZZY_MARGIN) {
    return { entry: best.entry, title: best.title, method: 'fuzzy', confidence: 'medium' }
  }

  return null
}
