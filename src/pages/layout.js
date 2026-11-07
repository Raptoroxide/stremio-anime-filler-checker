// Shared HTML shell + styles for the landing and details pages.
// Server-rendered, no framework, no external assets, no tracking.
// Readable at desktop, mobile and TV-browser sizes; verdicts are conveyed by
// text + shape, never by colour alone.

import { escapeHtml } from '../shared/escape.js'
import { ADDON_NAME, VERSION } from '../shared/types.js'

const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#101828"/><text x="16" y="21" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">FC</text></svg>'
)

export const STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #f4f6fb; color: #101828; line-height: 1.55; font-size: 18px; -webkit-text-size-adjust: 100%; }
  main { max-width: 780px; margin: 0 auto; padding: 28px 20px 64px; }
  h1 { font-size: clamp(1.7rem, 5.5vw, 2.5rem); margin: 8px 0 4px; line-height: 1.2; }
  h2 { font-size: clamp(1.2rem, 4vw, 1.5rem); margin: 40px 0 10px; }
  h3 { font-size: 1.05rem; margin: 24px 0 6px; }
  p { margin: 10px 0; }
  a { color: #155eef; }
  a:focus-visible, button:focus-visible { outline: 3px solid #6435e9; outline-offset: 2px; }
  .lead { font-size: 1.1rem; color: #344054; }
  .btn { display: inline-block; background: #6435e9; color: #fff; font-weight: 700; text-decoration: none; padding: 14px 26px; border-radius: 12px; border: none; font-size: 1.05rem; cursor: pointer; }
  .btn:hover { background: #5027cc; }
  .btn-secondary { background: #eef1f6; color: #101828; margin-left: 10px; }
  .urlbox { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: #eef1f6; border: 1px solid #d0d5dd; border-radius: 10px; padding: 10px 12px; margin: 12px 0; }
  .urlbox code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.95em; word-break: break-all; }
  .badge-verdict { display: inline-block; font-weight: 800; font-size: clamp(1.4rem, 6vw, 2.6rem); padding: 14px 28px; border-radius: 14px; color: #ffffff; border: 4px solid; letter-spacing: 0.5px; margin: 14px 0; }
  .verdict-filler { background: #b3261e; border-color: #7a1611; border-style: solid; }
  .verdict-manga-canon { background: #16704b; border-color: #0c4a30; border-style: dashed; }
  .verdict-anime-canon { background: #1d4ed8; border-color: #14307f; border-style: dotted; }
  .verdict-mixed { background: #9a6300; border-color: #5f3d00; border-style: double; }
  .verdict-unknown { background: #475467; border-color: #232b38; border-style: solid; }
  table.info { width: 100%; border-collapse: collapse; margin: 14px 0; }
  table.info th, table.info td { text-align: left; padding: 9px 12px; border-bottom: 1px solid #d8dde5; vertical-align: top; }
  table.info th { width: 34%; font-weight: 600; color: #344054; }
  .note { background: #fffaeb; border-left: 5px solid #f79009; padding: 12px 16px; border-radius: 8px; margin: 14px 0; }
  .note-blue { background: #eff4ff; border-left-color: #155eef; }
  .warn { background: #fef3f2; border-left: 5px solid #b3261e; padding: 12px 16px; border-radius: 8px; margin: 14px 0; }
  .chip { display: inline-block; font-weight: 700; font-size: 0.9em; padding: 3px 10px; border-radius: 999px; color: #fff; margin-right: 6px; }
  ul.verdicts { list-style: none; padding: 0; margin: 12px 0; }
  ul.verdicts li { margin: 10px 0; }
  footer { margin-top: 56px; font-size: 0.86em; color: #475467; border-top: 1px solid #d0d5dd; padding-top: 16px; }
  code { background: #eef1f6; border-radius: 5px; padding: 1px 6px; }
  .muted { color: #475467; }
  .small { font-size: 0.92em; }
  @media (max-width: 520px) { body { font-size: 17px; } table.info th { width: 42%; } .btn-secondary { margin-left: 0; margin-top: 10px; } }
`

export function renderPage ({ title, body, description = '', noindex = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}${description ? `<meta name="description" content="${escapeHtml(description)}">\n` : ''}<title>${escapeHtml(title)}</title>
<link rel="icon" href="${FAVICON}">
<style>${STYLES}</style>
</head>
<body>
<main>
${body}
<footer>
  <p><strong>${escapeHtml(ADDON_NAME)}</strong> v${escapeHtml(VERSION)} — an informational Stremio add-on. It never provides or modifies video streams.</p>
  <p>Data: <a href="https://www.animefillerlist.com/" rel="noopener">AnimeFillerList</a> (primary) and the <a href="https://fillerlists.com/data" rel="noopener">FillerLists</a> dataset (CC BY-SA 4.0 fallback). Classifications are community-maintained and belong to their sources — see <a href="/check#help">help</a> and CREDITS.md in the source repository.</p>
  <p>No accounts, no tracking, no analytics, no personal data collection. Metadata: Stremio Cinemeta / Kitsu.</p>
</footer>
</main>
</body>
</html>`
}

/** Format an ISO timestamp deterministically (no locale dependencies). */
export function fmtTimestamp (iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return escapeHtml(String(iso))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
  } catch {
    return escapeHtml(String(iso))
  }
}

/** Render an external link only for https URLs; anything else becomes text. */
export function safeLink (url, label) {
  if (typeof url === 'string' && /^https:\/\//.test(url)) {
    return `<a href="${escapeHtml(url)}" rel="noopener" target="_blank">${escapeHtml(label || url)}</a>`
  }
  return escapeHtml(url == null ? '—' : String(url))
}
