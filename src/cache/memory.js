// Lightweight in-memory TTL cache designed for warm serverless instances.
//
// - Fresh entries are served until their TTL expires.
// - Expired entries are retained for a grace period ("stale") so that a
//   temporary upstream outage can still be served with a "cached data" flag.
// - Negative results are stored with a shorter TTL simply by calling set()
//   with a smaller ttlMs.
// - In-flight de-duplication prevents concurrent requests from hammering the
//   same upstream URL.
// - Nothing is ever written to the filesystem: on Vercel the function
//   filesystem is ephemeral by design.

export class TTLCache {
  constructor ({ maxEntries = 400 } = {}) {
    this.maxEntries = maxEntries
    this.map = new Map()
  }

  /** Store a value with a TTL and a longer stale-retention window. */
  set (key, value, ttlMs, now = Date.now()) {
    if (this.map.size >= this.maxEntries) this.prune(now)
    const expiresAt = now + Math.max(1, ttlMs)
    const retainUntil = expiresAt + Math.max(ttlMs * 3, 60000)
    this.map.set(key, { value, expiresAt, retainUntil })
  }

  /** Returns the value only while fresh, else null. */
  get (key, now = Date.now()) {
    const e = this.map.get(key)
    if (!e) return null
    return now < e.expiresAt ? e.value : null
  }

  /**
   * Returns { state: 'fresh'|'stale'|'none', value } — 'stale' means the TTL
   * has expired but the entry is still retained as an outage fallback.
   */
  peek (key, now = Date.now()) {
    const e = this.map.get(key)
    if (!e) return { state: 'none', value: null }
    if (now < e.expiresAt) return { state: 'fresh', value: e.value }
    if (now >= e.retainUntil) {
      this.map.delete(key)
      return { state: 'none', value: null }
    }
    return { state: 'stale', value: e.value }
  }

  delete (key) {
    this.map.delete(key)
  }

  /** Drop expired-and-past-retention entries; if still full, drop oldest. */
  prune (now = Date.now()) {
    for (const [k, e] of this.map) {
      if (now >= e.retainUntil) this.map.delete(k)
    }
    while (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }

  get size () {
    return this.map.size
  }

  stats () {
    return { entries: this.map.size, maxEntries: this.maxEntries }
  }
}

/**
 * Share a single in-flight promise per key. `inflight` is a Map owned by the
 * caller (so scopes can be isolated in tests).
 */
export function dedupe (inflight, key, loader) {
  if (inflight.has(key)) return inflight.get(key)
  const p = Promise.resolve().then(loader)
  p.catch(() => {}).then(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}
