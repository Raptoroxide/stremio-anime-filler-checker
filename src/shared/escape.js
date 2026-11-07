// HTML/URL escaping helpers. Every dynamic value rendered into an HTML page or
// URL goes through these functions.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escape text for safe interpolation into HTML content and attribute values. */
export function escapeHtml (value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
}

/**
 * Validate a Host header before it is used to build absolute URLs
 * (install links, stream externalUrl). Returns null when suspicious.
 */
export function sanitizeHost (host) {
  if (typeof host !== 'string') return null
  const h = host.trim().toLowerCase()
  if (/^[a-z0-9.-]{1,253}$/.test(h)) return h
  if (/^[a-z0-9.-]{1,253}:\d{2,5}$/.test(h)) return h
  return null
}

/** Truncate long titles for one-line display, appending an ellipsis. */
export function truncate (value, max) {
  const s = String(value == null ? '' : value)
  if (s.length <= max) return s
  return s.slice(0, Math.max(1, max - 1)) + '…'
}
