// TTL cache + in-flight deduplication.

import test from 'node:test'
import assert from 'node:assert/strict'
import { TTLCache, dedupe } from '../src/cache/memory.js'

test('TTLCache: fresh within TTL, null after', () => {
  const cache = new TTLCache()
  let t = 1000
  cache.set('k', { v: 1 }, 5000, t)
  assert.deepEqual(cache.get('k', t), { v: 1 })
  assert.deepEqual(cache.get('k', t + 4999), { v: 1 })
  assert.equal(cache.get('k', t + 5001), null)
})

test('TTLCache: peek reports fresh/stale/none with the stale-retention window', () => {
  const cache = new TTLCache()
  let t = 0
  cache.set('k', 'val', 1000, t)
  assert.equal(cache.peek('k', t).state, 'fresh')
  assert.equal(cache.peek('k', t + 1500).state, 'stale')
  assert.deepEqual(cache.peek('k', t + 1500).value, 'val')
  // retention = expiresAt + max(ttl*3, 60s)
  assert.equal(cache.peek('k', t + 50000).state, 'stale')
  assert.equal(cache.peek('k', t + 61000).state, 'none')
})

test('TTLCache: maxEntries evicts oldest when full', () => {
  const cache = new TTLCache({ maxEntries: 3 })
  let t = 0
  cache.set('a', 1, 100000, t)
  cache.set('b', 2, 100000, t)
  cache.set('c', 3, 100000, t)
  cache.set('d', 4, 100000, t)
  assert.equal(cache.size, 3)
  assert.equal(cache.get('a', t), null)
  assert.equal(cache.get('d', t), 4)
})

test('TTLCache: stats', () => {
  const cache = new TTLCache({ maxEntries: 5 })
  cache.set('x', 1, 1000, 0)
  assert.deepEqual(cache.stats(), { entries: 1, maxEntries: 5 })
})

test('dedupe: concurrent loads share one promise', async () => {
  const inflight = new Map()
  let calls = 0
  const loader = async () => {
    calls++
    await new Promise((r) => setTimeout(r, 20))
    return 'value'
  }
  const [a, b, c] = await Promise.all([
    dedupe(inflight, 'key', loader),
    dedupe(inflight, 'key', loader),
    dedupe(inflight, 'key', loader)
  ])
  assert.equal(calls, 1)
  assert.equal(a, 'value')
  assert.equal(b, 'value')
  assert.equal(c, 'value')
  // after completion the in-flight entry is cleared
  assert.equal(inflight.size, 0)
})
