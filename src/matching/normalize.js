// Deterministic title normalization and conservative matching helpers.

/**
 * Normalize a series title for matching:
 *  - Unicode NFKC (full-width → ascii), lowercase, trim
 *  - strip diacritics (Shingeki no Kyōjin → kyojin)
 *  - × / ✕ → x (Hunter × Hunter ↔ Hunter x Hunter)
 *  - & → and
 *  - apostrophes removed, all other punctuation → spaces
 *  - common romaji long-vowel variants folded (ou→o, uu→u) so
 *    "Shippuuden" ≈ "Shippuden"
 *
 * A leading "the" is intentionally KEPT here (so "The One Piece" and
 * "One Piece" stay distinct); the matcher compares with and without it in
 * separate tiers. This never merges two different series: it only folds
 * spelling variants.
 */
export function normalizeTitle (input) {
  let s = String(input == null ? '' : input).normalize('NFKC').toLowerCase().trim()
  s = s.replace(/[×✕⨯]/g, 'x').replace(/&/g, ' and ')
  s = s.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC')
  s = s.replace(/['’ʼ`´]/g, '')
  s = s.replace(/[^\p{L}\p{N}]+/gu, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  if (!s) return ''
  s = s.replace(/ou/g, 'o').replace(/uu/g, 'u')
  return s.trim()
}

/**
 * Split a trailing year off a normalized title: "berserk 2016" →
 * { base: 'berserk', year: 2016 }. Only plausible years are split, so
 * "mobile suit gundam 0079" or "86 eighty six" stay intact.
 */
export function splitYearSuffix (norm) {
  if (!norm) return { base: norm || '', year: null }
  const m = norm.match(/^(.+?)\s+(\d{4})$/)
  if (m) {
    const year = Number(m[2])
    const base = m[1].trim()
    if (base && year >= 1919 && year <= 2099) return { base, year }
  }
  return { base: norm, year: null }
}
