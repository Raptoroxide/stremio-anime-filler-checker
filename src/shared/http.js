// Guarded outbound HTTP layer.
//
// Security and politeness rules:
//  - Only requests to a fixed allowlist of hosts are possible (SSRF guard);
//    user-supplied ids never become URLs.
//  - A descriptive, honest User-Agent is always sent.
//  - Per-host minimum gaps enforce AnimeFillerList's robots.txt Crawl-delay: 10
//    for automated access from a warm instance.
//  - Timeouts via AbortController, one bounded retry with backoff, response
//    size caps, and a per-request deadline so a slow source can never hang a
//    function invocation.

const ALLOWED_HOSTS = new Set(['v3-cinemeta.strem.io', 'www.animefillerlist.com', 'kitsu.io'])

const HOST_POLICIES = {
  // robots.txt for www.animefillerlist.com declares "Crawl-delay: 10".
  'www.animefillerlist.com': { minGapMs: 10000, timeoutMs: 6000, retries: 1 },
  'v3-cinemeta.strem.io': { minGapMs: 150, timeoutMs: 6000, retries: 1 },
  'kitsu.io': { minGapMs: 250, timeoutMs: 5000, retries: 1 }
}

export const USER_AGENT =
  'AnimeFillerChecker-StremioAddon/1.0 (+Stremio add-on; informational episode classifications; respects robots.txt)'

export class HttpError extends Error {
  constructor (message, status = 0) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Creates a fetcher bound to policies. `fetchImpl` is injectable for tests;
 * `policies` optionally overrides per-host policy (used by tests to shrink
 * the Crawl-delay window).
 */
export function createHttp ({ fetchImpl = globalThis.fetch, policies = {} } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('createHttp requires a fetch implementation')
  const hostState = new Map() // host -> { chain: Promise, lastStartAt: number }

  function policyFor (host) {
    return {
      minGapMs: 250,
      timeoutMs: 5000,
      retries: 0,
      ...HOST_POLICIES[host],
      ...(policies && policies[host])
    }
  }

  async function runWithHostGap (host, minGapMs, scope, fn) {
    const st = hostState.get(host) || { chain: Promise.resolve(), lastStartAt: 0 }
    const gate = st.chain.catch(() => {}).then(async () => {
      const waitMs = st.lastStartAt + minGapMs - Date.now()
      if (waitMs > 0) {
        // Fail fast rather than sleeping past the request deadline.
        if (scope && scope.deadlineAt && Date.now() + waitMs > scope.deadlineAt - 2500) {
          throw new HttpError('rate-limit window would exceed the request deadline')
        }
        await sleep(Math.min(waitMs, 15000))
      }
      st.lastStartAt = Date.now()
    })
    st.chain = gate.catch(() => {})
    hostState.set(host, st)
    await gate
    return fn()
  }

  async function fetchText (url, { scope = null, timeoutMs = null, sizeCapBytes = 6 * 1024 * 1024, headers = {} } = {}) {
    let u
    try { u = new URL(url) } catch { throw new HttpError('invalid upstream url') }
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) {
      throw new HttpError(`host not allowed: ${u.hostname}`)
    }
    if (scope && scope.deadlineAt && Date.now() > scope.deadlineAt - 500) {
      throw new HttpError('request deadline exceeded')
    }
    const policy = policyFor(u.hostname)

    return runWithHostGap(u.hostname, policy.minGapMs, scope, async () => {
      const attempt = async () => {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), timeoutMs || policy.timeoutMs)
        try {
          const res = await fetchImpl(u.toString(), {
            headers: { 'User-Agent': USER_AGENT, ...headers },
            signal: ctrl.signal,
            redirect: 'follow'
          })
          const declared = Number(res.headers.get('content-length') || 0)
          if (declared > sizeCapBytes) throw new HttpError('upstream response too large')
          const text = await res.text()
          if (text.length > sizeCapBytes) throw new HttpError('upstream response too large')
          if (!res.ok) throw new HttpError(`upstream responded ${res.status}`, res.status)
          return { text, status: res.status, url: u.toString() }
        } finally {
          clearTimeout(timer)
        }
      }

      let lastErr
      const tries = 1 + (policy.retries || 0)
      for (let i = 0; i < tries; i++) {
        try {
          return await attempt()
        } catch (err) {
          lastErr = err
          const status = err && err.status
          // Do not retry plain client errors (401/403/404...), but retry 429 and 5xx/network.
          if (status && status >= 400 && status < 500 && status !== 429) throw err
          if (scope && scope.deadlineAt && Date.now() > scope.deadlineAt - 1000) throw err
          if (i < tries - 1) await sleep(350 + i * 500)
        }
      }
      throw lastErr
    })
  }

  async function fetchJson (url, opts = {}) {
    const r = await fetchText(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } })
    try {
      return JSON.parse(r.text)
    } catch {
      throw new HttpError('upstream returned invalid JSON')
    }
  }

  return { fetchText, fetchJson, ALLOWED_HOSTS }
}
