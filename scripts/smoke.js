#!/usr/bin/env node
// Endpoint smoke test against a RUNNING instance (needs internet for the
// real metadata/data sources).
//
//   npm start          # in one terminal
//   npm run smoke      # in another (or SMOKE_BASE_URL=https://your-app …)
//
// Verifies the manifest, health, CORS headers, a known filler episode, a
// known manga-canon episode, a mixed episode, a multi-season mapping, a
// non-anime series (must be empty), and an unresolvable id (must be empty).

const BASE = (process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '')

const CHECKS = [
  {
    name: 'manifest.json is a valid Stremio manifest',
    url: '/manifest.json',
    validate: (j) => j && j.id === 'org.raptoroxide.animefillerchecker' &&
      Array.isArray(j.resources) && j.resources.includes('stream') &&
      j.types.includes('series') && Array.isArray(j.catalogs) && j.catalogs.length === 0
  },
  {
    name: 'health responds ok',
    url: '/health',
    validate: (j) => j && j.status === 'ok' && !!j.version
  },
  {
    name: 'known FILLER — Naruto S1E26',
    url: '/stream/series/tt0409591:1:26.json',
    validate: (j) => j && Array.isArray(j.streams) && j.streams.length === 1 &&
      /FILLER/.test(j.streams[0].description) && /Episode 26/.test(j.streams[0].description) &&
      typeof j.streams[0].externalUrl === 'string' &&
      !j.streams[0].url && !j.streams[0].infoHash && !j.streams[0].ytId
  },
  {
    name: 'known MANGA CANON — Naruto S1E1',
    url: '/stream/series/tt0409591:1:1.json',
    validate: (j) => j && j.streams.length === 1 && /MANGA CANON/.test(j.streams[0].description)
  },
  {
    name: 'known MIXED — Naruto S1E7',
    url: '/stream/series/tt0409591:1:7.json',
    validate: (j) => j && j.streams.length === 1 && /MIXED CANON\/FILLER/.test(j.streams[0].description)
  },
  {
    name: 'multi-season mapping — Attack on Titan S2E1 maps to Episode 26',
    url: '/stream/series/tt2560140:2:1.json',
    validate: (j) => j && j.streams.length === 1 &&
      /MANGA CANON/.test(j.streams[0].description) && /Episode 26/.test(j.streams[0].description)
  },
  {
    name: 'non-anime series returns an empty, valid response',
    url: '/stream/series/tt2861424:1:1.json', // Rick and Morty
    validate: (j) => j && Array.isArray(j.streams) && j.streams.length === 0
  },
  {
    name: 'unrecognized id family returns an empty, valid response',
    url: '/stream/series/foo123:1:2.json',
    validate: (j) => j && Array.isArray(j.streams) && j.streams.length === 0
  }
]

async function main () {
  let pass = 0
  let fail = 0
  let corsOk = null
  console.log(`Smoke test against ${BASE}\n`)
  for (const check of CHECKS) {
    try {
      const res = await fetch(BASE + check.url, { headers: { Origin: 'https://app.strem.io' } })
      const cors = res.headers.get('access-control-allow-origin')
      if (corsOk === null) corsOk = cors
      const json = await res.json().catch(() => null)
      const ok = res.status === 200 && check.validate(json)
      if (ok) { pass++; console.log(`  PASS  ${check.name}`) } else { fail++; console.log(`  FAIL  ${check.name} (HTTP ${res.status})`) }
      if (check.url === '/manifest.json') {
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) { fail++; console.log('  FAIL  manifest Content-Type is not application/json') } else { pass++ }
      }
    } catch (err) {
      fail++
      console.log(`  FAIL  ${check.name} — ${err && err.message}`)
    }
  }
  console.log(`\nCORS Access-Control-Allow-Origin: ${corsOk}`)
  if (corsOk !== '*') { fail++; console.log('  FAIL  CORS header missing or not *') } else { pass++ }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(1) })
