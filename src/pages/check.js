// Details page (/check): the page opened from a stream row's externalUrl, and
// the manual lookup / help page. Shows the verdict, source links, timestamps,
// mapping notes and the required help & limitation sections.

import { escapeHtml } from '../shared/escape.js'
import { renderPage, fmtTimestamp, safeLink } from './layout.js'
import { VERDICTS, UNKNOWN_REASONS, verdictLabel } from '../shared/types.js'

const INPUT_STYLE = 'font-size:1rem;padding:8px 10px;border-radius:8px;border:1px solid #d0d5dd;min-width:120px'

function verdictBadge (verdict) {
  const v = VERDICTS[verdict] || VERDICTS.unknown
  return `<div class="badge-verdict ${v.css}" role="status">${escapeHtml(v.label)}</div>`
}

function epText (requested, record) {
  if (requested.season === 0) return `Special · S0E${requested.episode}`
  if (record && Number.isInteger(record.episodeNumber)) {
    if (record.seasonPage || (requested.season === 1 && record.episodeNumber === requested.episode)) {
      return `Episode ${record.episodeNumber}`
    }
    return `S${requested.season}E${requested.episode} → Episode ${record.episodeNumber}`
  }
  return `S${requested.season}E${requested.episode}`
}

function helpSection () {
  const reasons = Object.entries(UNKNOWN_REASONS).map(([k, v]) => `<li><code>${escapeHtml(k)}</code> — ${escapeHtml(v)}</li>`).join('')
  return `
<h2 id="help">Help &amp; limitations</h2>
<h3>What the verdicts mean</h3>
<ul class="verdicts">
${Object.entries(VERDICTS).map(([key, v]) => `<li><span class="chip ${v.css}">${escapeHtml(v.label)}</span> ${escapeHtml(v.meaning)}</li>`).join('')}
</ul>
<h3>Why an episode can be UNKNOWN</h3>
<ul>${reasons}</ul>
<h3>Coverage &amp; accuracy</h3>
<ul>
  <li>Classifications come from <a href="https://www.animefillerlist.com/" rel="noopener">AnimeFillerList</a> (primary) and, as a fallback, the bundled <a href="https://fillerlists.com/data" rel="noopener">FillerLists</a> dataset (13 long-running anime, CC BY-SA 4.0). They are community-maintained and can be corrected at the source at any time.</li>
  <li>No source covers every anime; when a series is confidently anime but unlisted, this add-on shows UNKNOWN instead of guessing.</li>
  <li>For multi-season series, the absolute episode number is derived from your metadata provider's own season/episode data. When that mapping cannot be validated, the result is UNKNOWN rather than an invented offset.</li>
  <li>Series that cannot be confidently identified as anime get no informational row in Stremio at all.</li>
  <li>Results link to the exact source page so you can verify any classification yourself.</li>
</ul>
<h3>Manual lookup</h3>
<form method="get" action="/check" style="background:#eff4ff;border-radius:10px;padding:14px 16px;margin:10px 0">
  <p style="margin:6px 0">
    <label>Series title<br><input name="title" maxlength="200" required placeholder="e.g. Naruto" style="${INPUT_STYLE}"></label>
  </p>
  <p style="margin:6px 0;display:flex;gap:14px;flex-wrap:wrap">
    <label>Season<br><input name="season" type="number" min="0" max="100" required placeholder="1" style="${INPUT_STYLE}"></label>
    <label>Episode<br><input name="episode" type="number" min="1" max="5000" required placeholder="26" style="${INPUT_STYLE}"></label>
  </p>
  <p style="margin:10px 0 4px"><button class="btn" type="submit">Check episode</button></p>
  <p class="muted small" style="margin:4px 0">Manual lookups match by title, so they work best with the exact series name. Season&nbsp;1 episodes map directly to absolute numbering; for later seasons prefer opening the row from Stremio, which carries the series id.</p>
</form>
`
}

function snapshotBanner (snapshot) {
  if (!snapshot || !snapshot.label) return ''
  const label = VERDICTS[snapshot.label] ? VERDICTS[snapshot.label].label : escapeHtml(String(snapshot.label))
  return `<div class="note"><strong>When this row was generated in Stremio it showed: ${escapeHtml(label)}${snapshot.src ? ` (source: ${escapeHtml(snapshot.src)})` : ''}${snapshot.at ? `, checked ${escapeHtml(String(snapshot.at))}` : ''}.</strong><br>
A live re-check could not confirm it right now — the data source may be temporarily unavailable. Please verify at the source link above or retry later.</div>`
}

export function renderCheckPage ({ result = null, lookupError = null, query = {}, snapshot = null }) {
  // ---- State 1: nothing to look up → help page ------------------------------
  if (!result && !lookupError) {
    const body = `
<h1>Anime Filler Checker</h1>
<p class="lead">Episode classification details and manual lookup.</p>
${query.id || query.title
  ? `<div class="warn"><strong>Could not run this lookup.</strong> Provide a season and an episode together with a series id or title (for example <code>/check?id=tt0409591&amp;s=1&amp;e=26</code>).</div>`
  : ''}
${helpSection()}
`
    return renderPage({ title: 'Anime Filler Checker — details & help', body, noindex: true })
  }

  // ---- State 2/3: lookup failed ---------------------------------------------
  if (lookupError || !result.identified) {
    const message = lookupError || (result && result.error) || 'The series could not be identified.'
    const body = `
<h1>Anime Filler Checker</h1>
<div class="warn"><strong>Lookup failed.</strong><br>${escapeHtml(message)}</div>
${snapshotBanner(snapshot)}
<h2>Try again</h2>
<p>Open the episode in Stremio again in a moment, or use the manual lookup below. If it keeps failing, the metadata or data source may be having an outage — see the help section.</p>
${helpSection()}
`
    return renderPage({ title: 'Anime Filler Checker — lookup failed', body, noindex: true })
  }

  const { meta, record, requested } = result

  // ---- State 4: identified but not anime ------------------------------------
  if (!result.isAnime) {
    const body = `
<h1>Anime Filler Checker</h1>
<p class="lead">Result for <strong>${escapeHtml(meta.title)}</strong> · S${requested.season}E${requested.episode}</p>
<div class="note note-blue"><strong>No informational row is shown for this series.</strong><br>
This series could not be confidently identified as anime (classification sources require an exact match, and the
metadata must look like Japanese animation — genre “Animation” + country “Japan”, or a Kitsu id). Western animation
and live-action series are deliberately left alone rather than labelled UNKNOWN.</div>
${helpSection()}
`
    return renderPage({ title: `Anime Filler Checker — ${meta.title}`, body, noindex: true })
  }

  // ---- State 5: full verdict -------------------------------------------------
  const verdict = record ? record.verdict : 'unknown'
  const v = VERDICTS[verdict] || VERDICTS.unknown
  const reasonKey = (record && record.reason) || result.reason || 'no-data'

  const rows = []
  rows.push(['Series', `${escapeHtml(meta.title)}${meta.year ? ` <span class="muted">(${escapeHtml(String(meta.year))})</span>` : ''} <span class="muted small">via ${escapeHtml(meta.source)}</span>`])
  if (record && record.showTitle && record.showTitle !== meta.title) {
    rows.push(['Matched source entry', escapeHtml(record.showTitle) + (record.matchedAlias ? ` <span class="muted small">(alias match)</span>` : '')])
  }
  rows.push(['Requested', escapeHtml(epText(requested, record))])
  if (record && record.episodeTitle) rows.push(['Episode title', escapeHtml(record.episodeTitle)])
  if (record) {
    rows.push(['Source', safeLink(record.sourceUrl, `${record.sourceName} — open source page`)])
    rows.push(['Data checked', `${fmtTimestamp(record.checkedAt)}${record.sourceUpdatedAt ? ` <span class="muted small">(source last checked ${escapeHtml(String(record.sourceUpdatedAt))})</span>` : ''}`])
  }

  const notes = []
  if (verdict === 'mixed') {
    notes.push('<div class="note"><strong>Mixed episodes are not “safe to skip”.</strong> This episode contains both canon and filler material and may include important story content.</div>')
  }
  if (record && record.mappingConfidence === 'medium') {
    notes.push('<div class="note note-blue"><strong>Approximate episode mapping.</strong> The season/episode structure reported by your metadata provider does not exactly match the source\'s episode count, so the absolute episode number is derived and could be off by a small amount. Verify on the source page if in doubt.</div>')
  }
  if (record && result.provider && result.provider !== record.sourceName) {
    notes.push(`<div class="note note-blue"><strong>Fallback source used.</strong> The result above comes from <strong>${escapeHtml(record.sourceName)}</strong>; the primary source (AnimeFillerList) had no data for this episode or was unavailable for this lookup.</div>`)
  }
  if (record && record.fromCache) {
    notes.push('<div class="note note-blue"><strong>Cached data.</strong> The source was unavailable, so this result was served from the last successfully cached copy and may be slightly out of date.</div>')
  }
  if (!record) {
    notes.push(`<div class="note"><strong>Why UNKNOWN?</strong> Reason: <code>${escapeHtml(reasonKey)}</code> — ${escapeHtml(UNKNOWN_REASONS[reasonKey] || UNKNOWN_REASONS['no-data'])}.</div>`)
    if (result.errors && result.errors.length) {
      notes.push(`<div class="warn"><strong>Data sources were unreachable during this lookup:</strong><br>${result.errors.map((e) => escapeHtml(e)).join('<br>')}</div>`)
    }
  }
  notes.push('<p class="muted small">Classifications are community-maintained by their sources and can be corrected there at any time. This add-on only reports them and always links to the exact source page.</p>')

  const body = `
<h1>Anime Filler Checker</h1>
<p class="lead">Result for <strong>${escapeHtml(meta.title)}</strong> · ${escapeHtml(epText(requested, record))}</p>
${verdictBadge(verdict)}
<p>${escapeHtml(v.meaning)}</p>
${record ? `<p class="muted small">Verdict reported by <strong>${escapeHtml(record.sourceName)}</strong>${result.provider ? '' : ''}.</p>` : ''}
${notes.join('\n')}
<h2>Details</h2>
<table class="info">
${rows.map(([k, val]) => `<tr><th>${escapeHtml(k)}</th><td>${val}</td></tr>`).join('\n')}
</table>
${(!record && result.error) ? snapshotBanner(snapshot) : ''}
${helpSection()}
`
  return renderPage({
    title: `Anime Filler Checker — ${meta.title} ${epText(requested, record)}`,
    body,
    noindex: true
  })
}
