#!/usr/bin/env node
// "Build" step: loads every application module to prove the project parses
// and links cleanly (zero-dependency equivalent of a compile check).
//
//   npm run build

import { readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

async function walk (dir, out) {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, out)
    else if (/\.(js|mjs)$/.test(entry.name)) out.push(full)
  }
}

const files = []
await walk(join(ROOT, 'src'), files)
await walk(join(ROOT, 'api'), files)
files.push(join(ROOT, 'dev-server.mjs'))

let failed = 0
for (const file of files.sort()) {
  try {
    await import(pathToFileURL(file).href)
    console.log(`  ok   ${file.slice(ROOT.length + 1)}`)
  } catch (err) {
    failed++
    console.error(`  FAIL ${file.slice(ROOT.length + 1)} — ${err && err.message}`)
  }
}

console.log(`\n${files.length - failed}/${files.length} modules load cleanly.`)
process.exit(failed ? 1 : 0)
