#!/usr/bin/env node
// Maintainer tool: refresh the bundled data modules from the live sources.
//
//   npm run update-data
//
// Writes:
//   src/providers/data/afl-shows-seed.js     (show titles + URL slugs)
//   src/providers/data/fillerlists-bundle.js (per-episode verdict codes)
//
// The AnimeFillerList robots.txt Crawl-delay is respected by sleeping between
// requests. FillerLists data is CC BY-SA 4.0; the generated bundle keeps the
// required attribution inside the file. See CREDITS.md.

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseShowIndex, AFL_BASE } from '../src/providers/animefillerlist.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DATA_DIR = join(ROOT, 'src', 'providers', 'data')
const UA = 'AnimeFillerChecker-StremioAddon/1.0 (data refresh; respects robots.txt)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const today = new Date().toISOString().slice(0, 10)

async function fetchText (url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, redirect: 'follow' })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.text()
}

async function fetchJson (url) {
  const text = await fetchText(url, { Accept: 'application/json' })
  return JSON.parse(text)
}

function jsString (value) {
  return JSON.stringify(String(value == null ? '' : value))
}

async function updateAflSeed () {
  console.log(`Fetching ${AFL_BASE}/shows …`)
  const html = await fetchText(`${AFL_BASE}/shows`, { Accept: 'text/html,application/xhtml+xml' })
  const shows = parseShowIndex(html)
  if (shows.length < 50) throw new Error(`parsed only ${shows.length} shows — refusing to write a broken seed`)
  const lines = shows.map((s) => `  { slug: ${jsString(s.slug)}, title: ${jsString(s.title)} }`).join(',\n')
  const file = `// GENERATED FILE — do not edit by hand. Regenerate with: npm run update-data
//
// Show titles and public URL slugs from the AnimeFillerList shows index:
//   ${AFL_BASE}/shows
// Retrieved: ${today}
//
// This file contains routing information only (titles + slugs). Episode
// classifications are NEVER bundled; they are fetched live from
// AnimeFillerList on real lookups and cached. Attribution: AnimeFillerList,
// https://www.animefillerlist.com/ — see CREDITS.md.

export const AFL_SEED = Object.freeze({
  retrievedAt: ${jsString(today)},
  url: ${jsString(`${AFL_BASE}/shows`)},
  shows: Object.freeze([
${lines}
  ])
})
`
  await writeFile(join(DATA_DIR, 'afl-shows-seed.js'), file, 'utf8')
  console.log(`  wrote afl-shows-seed.js (${shows.length} shows)`)
}

const TYPE_TO_CODE = { canon: 'c', 'anime-canon': 'a', mixed: 'm', filler: 'f', unknown: 'u' }

async function updateFillerlistsBundle () {
  console.log('Fetching https://fillerlists.com/data/shows.json …')
  const showsIndex = await fetchJson('https://fillerlists.com/data/shows.json')
  const shows = Array.isArray(showsIndex.shows) ? showsIndex.shows : []
  if (shows.length < 5) throw new Error(`expected the FillerLists dataset, got ${shows.length} shows`)

  const licence = showsIndex.licence || {}
  const credit = showsIndex.credit || 'Anime filler data from FillerLists (https://fillerlists.com/data) and its sources, under CC BY-SA 4.0.'

  const outShows = []
  for (const show of shows) {
    const slug = show.show || show.slug
    if (!slug) continue
    await sleep(500) // be polite between show files
    console.log(`  fetching ${slug}.json …`)
    const data = await fetchJson(`https://fillerlists.com/data/${slug}.json`)
    const ep = {}
    let count = 0
    for (const episode of Array.isArray(data.episodes) ? data.episodes : []) {
      const n = Number(episode.n)
      if (!Number.isInteger(n) || n < 1 || n > 3000) continue
      ep[String(n)] = TYPE_TO_CODE[episode.type] || 'u'
      count++
    }
    outShows.push({
      slug,
      name: data.name || show.name || slug,
      imdbId: (data.ids && data.ids.imdb) || null,
      tvdbId: (data.ids && data.ids.tvdb) || null,
      url: data.url || `https://fillerlists.com/${slug}`,
      status: data.status || null,
      lastChecked: data.lastChecked || null,
      episodeCount: Number(data.episodeCount) || count,
      ep
    })
  }

  const showsJs = outShows.map((s) => {
    const epJs = Object.entries(s.ep).map(([n, code]) => `${JSON.stringify(n)}:${JSON.stringify(code)}`).join(',')
    return `    { slug: ${jsString(s.slug)}, name: ${jsString(s.name)}, imdbId: ${jsString(s.imdbId)}, tvdbId: ${s.tvdbId == null ? 'null' : JSON.stringify(s.tvdbId)}, url: ${jsString(s.url)}, status: ${jsString(s.status)}, lastChecked: ${jsString(s.lastChecked)}, episodeCount: ${s.episodeCount}, ep: {${epJs}} }`
  }).join(',\n')

  const file = `// GENERATED FILE — do not edit by hand. Regenerate with: npm run update-data
//
// ADAPTED DATASET — CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/
//
// Source: FillerLists, ${jsString(showsIndex.url || 'https://fillerlists.com/data')}
// Dataset "updated" field: ${jsString(showsIndex.updated || '')} · bundled on ${today}
// Licence: ${jsString(licence.name || 'CC BY-SA 4.0')} (${jsString(licence.url || 'https://creativecommons.org/licenses/by-sa/4.0/')})
//
// Required credit (from the source dataset):
//   ${credit}
//
// Modifications from the original per-episode JSON files: trimmed to episode
// numbers + single-letter verdict codes and a small subset of show metadata
// (names, ids, urls, check dates). Episode titles, air dates, arcs and
// TVmaze ids were dropped to keep the bundle small. Verdict values themselves
// are UNCHANGED. This adaptation is shared under the same CC BY-SA 4.0
// licence. Per-episode verdict codes: c = manga canon, a = anime canon,
// m = mixed canon/filler, f = filler, u = unknown/unsettled conflict.
//
// Coverage note: the FillerLists dataset documents ${outShows.length} long-running
// anime only. It does NOT cover anime generally — AnimeFillerList is the
// primary broad-coverage source for this add-on.

export const FILLERLISTS_BUNDLE = Object.freeze({
  retrievedAt: ${jsString(today)},
  datasetUpdated: ${jsString(showsIndex.updated || null)},
  source: Object.freeze({
    name: 'FillerLists',
    url: ${jsString(showsIndex.url || 'https://fillerlists.com/data')},
    licence: ${jsString(licence.name || 'CC BY-SA 4.0')},
    licenceUrl: ${jsString(licence.url || 'https://creativecommons.org/licenses/by-sa/4.0/')},
    credit: ${jsString(credit)}
  }),
  shows: Object.freeze([
${showsJs}
  ])
})
`
  await writeFile(join(DATA_DIR, 'fillerlists-bundle.js'), file, 'utf8')
  console.log(`  wrote fillerlists-bundle.js (${outShows.length} shows)`)
}

async function main () {
  await mkdir(DATA_DIR, { recursive: true })
  await updateAflSeed()
  await updateFillerlistsBundle()
  console.log('Done.')
}

main().catch((err) => {
  console.error('update-data failed:', err && err.message)
  process.exit(1)
})
